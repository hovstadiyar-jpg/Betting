"""Writes normalized provider data into PostgreSQL.

Guarantees:
* Idempotent: re-running a sync with identical prices inserts no new odds observations.
* Append-only history: a new ``odds_observations`` row is written only when a bookmaker's price changes.
* Serialised per provider: a transaction-level advisory lock prevents two syncs racing on the same rows.
* Audited: every run is recorded in ``provider_sync_runs`` (including failures, in a separate transaction).
"""

from __future__ import annotations

import logging
import zlib
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import case, func, select, text, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session, sessionmaker

from app.models import (
    Bookmaker,
    ExternalRef,
    Fixture,
    League,
    Market,
    OddsCurrent,
    OddsObservation,
    Player,
    ProviderSyncRun,
    Selection,
    Sport,
    Team,
)
from app.models.enums import EntityType, FixtureStatus, MarketType, SyncStatus
from app.providers.base import FetchResult, NormalizedEvent, NormalizedMarket, OddsProvider, ProviderError

log = logging.getLogger(__name__)
PRICE_QUANTUM = Decimal("0.001")


@dataclass
class SyncCounts:
    events_seen: int = 0
    markets_upserted: int = 0
    observations_inserted: int = 0


class Ingestor:
    """Upserts one FetchResult inside the caller's transaction."""

    def __init__(
        self, session: Session, provider: str, data_source: str, sync_run_id: int | None = None
    ) -> None:
        self.s = session
        self.provider = provider
        self.data_source = data_source
        self.sync_run_id = sync_run_id
        self._sports: dict[str, int] = {}
        self._leagues: dict[str, int] = {}
        self._teams: dict[tuple[int, str], int] = {}
        self._players: dict[tuple[int, int | None, str], int] = {}
        self._books: dict[str, int] = {}

    # --- reference data -------------------------------------------------------------------------

    def _upsert_returning_id(self, stmt: object) -> int:
        result = self.s.execute(stmt)  # type: ignore[call-overload]
        return int(result.scalar_one())

    def sport(self, key: str, name: str) -> int:
        if key not in self._sports:
            stmt = (
                insert(Sport)
                .values(key=key, name=name)
                .on_conflict_do_update(index_elements=[Sport.key], set_={"updated_at": func.now()})
                .returning(Sport.id)
            )
            self._sports[key] = self._upsert_returning_id(stmt)
        return self._sports[key]

    def league(self, key: str, name: str, sport_id: int, region: str | None) -> int:
        if key not in self._leagues:
            stmt = (
                insert(League)
                .values(key=key, name=name, sport_id=sport_id, region=region)
                .on_conflict_do_update(
                    index_elements=[League.key], set_={"name": name, "updated_at": func.now()}
                )
                .returning(League.id)
            )
            self._leagues[key] = self._upsert_returning_id(stmt)
        return self._leagues[key]

    def team(self, sport_id: int, name: str, league_id: int | None) -> int:
        cache_key = (sport_id, name)
        if cache_key not in self._teams:
            stmt = (
                insert(Team)
                .values(sport_id=sport_id, name=name, league_id=league_id, short_name=_short_name(name))
                .on_conflict_do_update(
                    index_elements=[Team.sport_id, Team.name],
                    # Keep the first league we saw unless none was set.
                    set_={"league_id": func.coalesce(Team.league_id, league_id), "updated_at": func.now()},
                )
                .returning(Team.id)
            )
            self._teams[cache_key] = self._upsert_returning_id(stmt)
        return self._teams[cache_key]

    def player(self, sport_id: int, name: str, team_id: int | None) -> int:
        cache_key = (sport_id, team_id, name)
        if cache_key not in self._players:
            existing = self.s.execute(
                select(Player.id).where(
                    Player.sport_id == sport_id,
                    Player.name == name,
                    Player.team_id.is_(None) if team_id is None else Player.team_id == team_id,
                )
            ).scalar_one_or_none()
            if existing is None:
                player = Player(sport_id=sport_id, name=name, team_id=team_id)
                self.s.add(player)
                self.s.flush()
                existing = player.id
            self._players[cache_key] = existing
        return self._players[cache_key]

    def bookmaker(self, key: str, name: str, region: str | None = None) -> int:
        if key not in self._books:
            stmt = (
                insert(Bookmaker)
                .values(key=key, name=name, region=region)
                .on_conflict_do_update(
                    index_elements=[Bookmaker.key], set_={"name": name, "updated_at": func.now()}
                )
                .returning(Bookmaker.id)
            )
            self._books[key] = self._upsert_returning_id(stmt)
        return self._books[key]

    # --- fixtures & markets -----------------------------------------------------------------------

    def fixture(self, event: NormalizedEvent, league_id: int, home_id: int, away_id: int) -> int:
        ref = self.s.execute(
            select(ExternalRef.entity_id).where(
                ExternalRef.provider == self.provider,
                ExternalRef.entity_type == EntityType.FIXTURE.value,
                ExternalRef.external_id == event.external_id,
            )
        ).scalar_one_or_none()
        if ref is not None:
            fixture = self.s.get_one(Fixture, ref)
            fixture.starts_at = event.starts_at
            fixture.status = event.status.value
            fixture.data_source = self.data_source
            return fixture.id

        fixture = Fixture(
            league_id=league_id,
            home_team_id=home_id,
            away_team_id=away_id,
            starts_at=event.starts_at,
            status=event.status.value,
            data_source=self.data_source,
        )
        self.s.add(fixture)
        self.s.flush()
        self.s.add(
            ExternalRef(
                provider=self.provider,
                entity_type=EntityType.FIXTURE.value,
                external_id=event.external_id,
                entity_id=fixture.id,
            )
        )
        return fixture.id

    def market(self, fixture_id: int, m: NormalizedMarket, sport_id: int, league_id: int) -> int:
        player_id: int | None = None
        team_id: int | None = None
        if m.market_type is MarketType.PLAYER_PROP and m.player_name:
            player_team = self.team(sport_id, m.team_name, league_id) if m.team_name else None
            player_id = self.player(sport_id, m.player_name, player_team)
        elif m.market_type is MarketType.TEAM_PROP and m.team_name:
            team_id = self.team(sport_id, m.team_name, league_id)

        stmt = (
            insert(Market)
            .values(
                fixture_id=fixture_id,
                market_type=m.market_type.value,
                name=m.name[:200],
                line=m.line,
                player_id=player_id,
                team_id=team_id,
                stat=m.stat,
            )
            .on_conflict_do_update(
                constraint="uq_markets_identity", set_={"name": m.name[:200], "updated_at": func.now()}
            )
            .returning(Market.id)
        )
        return self._upsert_returning_id(stmt)

    def selection(self, market_id: int, key: str, label: str) -> int:
        stmt = (
            insert(Selection)
            .values(market_id=market_id, key=key, label=label[:200])
            .on_conflict_do_update(
                index_elements=[Selection.market_id, Selection.key],
                set_={"label": label[:200], "updated_at": func.now()},
            )
            .returning(Selection.id)
        )
        return self._upsert_returning_id(stmt)

    def latest_prices(self, selection_ids: list[int]) -> dict[tuple[int, int], Decimal]:
        if not selection_ids:
            return {}
        rows = self.s.execute(
            select(OddsCurrent.selection_id, OddsCurrent.bookmaker_id, OddsCurrent.price).where(
                OddsCurrent.selection_id.in_(selection_ids)
            )
        ).all()
        return {(r.selection_id, r.bookmaker_id): r.price for r in rows}

    # --- entry point ------------------------------------------------------------------------------

    def ingest(self, result: FetchResult) -> SyncCounts:
        counts = SyncCounts()
        seen_at = datetime.now(UTC)
        books_by_key = {b.key: b for b in result.bookmakers}

        for event in result.events:
            counts.events_seen += 1
            sport_id = self.sport(event.sport_key, event.sport_name)
            league_id = self.league(event.league_key, event.league_name, sport_id, event.league_region)
            home_id = self.team(sport_id, event.home_team, league_id)
            away_id = self.team(sport_id, event.away_team, league_id)
            if home_id == away_id:
                log.warning("Skipping event %s with identical teams", event.external_id)
                continue
            fixture_id = self.fixture(event, league_id, home_id, away_id)

            pending: list[tuple[int, str, Decimal, datetime]] = []  # (selection_id, book_key, price, time)
            for m in event.markets:
                market_id = self.market(fixture_id, m, sport_id, league_id)
                counts.markets_upserted += 1
                for sel in m.selections:
                    selection_id = self.selection(market_id, sel.key, sel.label)
                    for price in sel.prices:
                        pending.append((selection_id, price.bookmaker_key, price.price, price.observed_at))

            latest = self.latest_prices(sorted({p[0] for p in pending}))
            new_rows: list[dict[str, object]] = []
            current: dict[tuple[int, int], dict[str, object]] = {}
            for selection_id, book_key, amount, observed_at in pending:
                book = books_by_key.get(book_key)
                book_id = self.bookmaker(
                    book_key, book.name if book else book_key, book.region if book else None
                )
                quantized = amount.quantize(PRICE_QUANTUM)
                current[(selection_id, book_id)] = {
                    "selection_id": selection_id,
                    "bookmaker_id": book_id,
                    "price": quantized,
                    "price_since": observed_at,
                    "last_seen_at": seen_at,
                }
                if latest.get((selection_id, book_id)) == quantized:
                    continue
                latest[(selection_id, book_id)] = quantized
                new_rows.append(
                    {
                        "selection_id": selection_id,
                        "bookmaker_id": book_id,
                        "price": quantized,
                        "observed_at": observed_at,
                        "sync_run_id": self.sync_run_id,
                    }
                )
            if new_rows:
                self.s.execute(insert(OddsObservation), new_rows)
                counts.observations_inserted += len(new_rows)
            if current:
                stmt = insert(OddsCurrent)
                self.s.execute(
                    stmt.on_conflict_do_update(
                        index_elements=[OddsCurrent.selection_id, OddsCurrent.bookmaker_id],
                        set_={
                            "price": stmt.excluded.price,
                            "last_seen_at": stmt.excluded.last_seen_at,
                            # Only move price_since when the price actually changed.
                            "price_since": case(
                                (OddsCurrent.price != stmt.excluded.price, stmt.excluded.price_since),
                                else_=OddsCurrent.price_since,
                            ),
                        },
                    ),
                    list(current.values()),
                )

        self.close_stale_fixtures()
        return counts

    def close_stale_fixtures(self, after: timedelta = timedelta(hours=4)) -> None:
        """Odds feeds stop listing events once they finish; mark this source's old fixtures as finished."""
        self.s.execute(
            update(Fixture)
            .where(
                Fixture.data_source == self.data_source,
                Fixture.status.in_([FixtureStatus.SCHEDULED.value, FixtureStatus.LIVE.value]),
                Fixture.starts_at < datetime.now(UTC) - after,
            )
            .values(status=FixtureStatus.FINISHED.value)
        )


def _short_name(name: str) -> str:
    words = [w for w in name.replace(".", "").split() if w]
    if len(words) >= 2:
        return "".join(w[0] for w in words[:3]).upper()
    return name[:3].upper()


def run_sync(
    session_factory: sessionmaker[Session],
    provider: OddsProvider,
    league_keys: list[str] | None = None,
) -> ProviderSyncRun:
    """Fetch from a provider and ingest the result, recording the run. Returns the finished run row."""
    with session_factory() as s, s.begin():
        run = ProviderSyncRun(provider=provider.name, scope=",".join(league_keys or ["*"])[:256])
        s.add(run)
        s.flush()
        run_id = run.id

    try:
        result = provider.fetch(league_keys)
        with session_factory() as s, s.begin():
            # Serialise syncs of the same provider (released at commit/rollback).
            s.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": zlib.crc32(provider.name.encode())})
            counts = Ingestor(s, provider.name, provider.data_source, run_id).ingest(result)
            run = s.get_one(ProviderSyncRun, run_id)
            run.scope = result.scope
            run.status = SyncStatus.SUCCEEDED.value
            run.finished_at = datetime.now(UTC)
            run.events_seen = counts.events_seen
            run.markets_upserted = counts.markets_upserted
            run.observations_inserted = counts.observations_inserted
            run.requests_used = result.requests_used
            run.requests_remaining = result.requests_remaining
        log.info("Sync %s ok: %s", provider.name, counts)
    except Exception as exc:
        message = str(exc) if isinstance(exc, ProviderError) else f"{type(exc).__name__}: ingestion failed"
        log.exception("Sync %s failed", provider.name)
        with session_factory() as s, s.begin():
            run = s.get_one(ProviderSyncRun, run_id)
            run.status = SyncStatus.FAILED.value
            run.finished_at = datetime.now(UTC)
            run.error = message[:2000]
        raise

    with session_factory() as s:
        return s.get_one(ProviderSyncRun, run_id)
