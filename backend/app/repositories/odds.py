"""Read-side queries used by the API. All functions take an open Session and return ORM rows or plain data."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, TypeVar

from sqlalchemy import Select, func, select
from sqlalchemy.dialects.postgresql import aggregate_order_by
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models import (
    Bookmaker,
    Fixture,
    League,
    Market,
    OddsCurrent,
    OddsObservation,
    Player,
    Selection,
    Sport,
    Team,
)
from app.models.enums import FixtureStatus

SelectT = TypeVar("SelectT", bound=Select[Any])

# Fixtures that started up to this long ago are still "upcoming/in play" for listing purposes.
IN_PLAY_GRACE = timedelta(hours=3)


@dataclass(frozen=True)
class CurrentPrice:
    bookmaker_id: int
    bookmaker_key: str
    price: float
    observed_at: datetime  # when the bookmaker moved to this price
    last_seen_at: datetime  # last sync that confirmed it


@dataclass
class FixtureFilters:
    sport: str | None = None
    league: str | None = None
    status: FixtureStatus | None = None
    starts_after: datetime | None = None
    starts_before: datetime | None = None
    upcoming: bool = True
    team_id: int | None = None


def fixture_select() -> Select[Fixture]:
    return select(Fixture).options(
        joinedload(Fixture.league).joinedload(League.sport),
        joinedload(Fixture.home_team),
        joinedload(Fixture.away_team),
    )


def _apply_fixture_filters(stmt: SelectT, f: FixtureFilters) -> SelectT:
    if f.sport or f.league:
        stmt = stmt.join(League, Fixture.league_id == League.id)
        if f.league:
            stmt = stmt.where(League.key == f.league)
        if f.sport:
            stmt = stmt.join(Sport, League.sport_id == Sport.id).where(Sport.key == f.sport)
    if f.upcoming:
        stmt = stmt.where(
            Fixture.status.in_([FixtureStatus.SCHEDULED.value, FixtureStatus.LIVE.value]),
            Fixture.starts_at >= datetime.now(UTC) - IN_PLAY_GRACE,
        )
    if f.status:
        stmt = stmt.where(Fixture.status == f.status.value)
    if f.starts_after:
        stmt = stmt.where(Fixture.starts_at >= f.starts_after)
    if f.starts_before:
        stmt = stmt.where(Fixture.starts_at < f.starts_before)
    if f.team_id:
        stmt = stmt.where((Fixture.home_team_id == f.team_id) | (Fixture.away_team_id == f.team_id))
    return stmt


def list_fixtures(s: Session, f: FixtureFilters, limit: int, offset: int) -> tuple[Sequence[Fixture], int]:
    base = _apply_fixture_filters(select(Fixture.id), f)
    total = s.scalar(select(func.count()).select_from(base.subquery())) or 0
    stmt = (
        _apply_fixture_filters(fixture_select(), f)
        .order_by(Fixture.starts_at, Fixture.id)
        .limit(limit)
        .offset(offset)
    )
    return s.scalars(stmt).unique().all(), total


def get_fixture(s: Session, fixture_id: int) -> Fixture | None:
    return s.scalars(fixture_select().where(Fixture.id == fixture_id)).unique().one_or_none()


def fixtures_by_id(s: Session, ids: set[int]) -> dict[int, Fixture]:
    if not ids:
        return {}
    return {f.id: f for f in s.scalars(fixture_select().where(Fixture.id.in_(ids))).unique()}


# --- markets & prices ---------------------------------------------------------------------------


@dataclass
class MarketFilters:
    fixture_id: int | None = None
    market_types: list[str] | None = None
    player_id: int | None = None
    team_id: int | None = None
    stat: str | None = None
    fixtures: FixtureFilters | None = None


def _market_select(f: MarketFilters) -> Select[Market]:
    stmt = select(Market).join(Fixture, Market.fixture_id == Fixture.id)
    if f.fixture_id is not None:
        stmt = stmt.where(Market.fixture_id == f.fixture_id)
    elif f.fixtures is not None:
        stmt = _apply_fixture_filters(stmt, f.fixtures)
    if f.market_types:
        stmt = stmt.where(Market.market_type.in_(f.market_types))
    if f.player_id is not None:
        stmt = stmt.where(Market.player_id == f.player_id)
    if f.team_id is not None:
        # Team props for the team, or player props for the team's players.
        stmt = stmt.outerjoin(Player, Market.player_id == Player.id).where(
            (Market.team_id == f.team_id) | (Player.team_id == f.team_id)
        )
    if f.stat:
        stmt = stmt.where(Market.stat == f.stat)
    return stmt


def list_markets(
    s: Session, f: MarketFilters, limit: int | None, offset: int = 0
) -> tuple[Sequence[Market], int]:
    total = (
        s.scalar(select(func.count()).select_from(_market_select(f).with_only_columns(Market.id).subquery()))
        or 0
    )
    stmt = (
        _market_select(f)
        .options(selectinload(Market.selections))
        .order_by(Fixture.starts_at, Market.fixture_id, Market.market_type, Market.line, Market.id)
        .offset(offset)
    )
    if limit is not None:
        stmt = stmt.limit(limit)
    return s.scalars(stmt).unique().all(), total


def markets_by_id(s: Session, ids: set[int]) -> dict[int, Market]:
    if not ids:
        return {}
    stmt = select(Market).options(selectinload(Market.selections)).where(Market.id.in_(ids))
    return {m.id: m for m in s.scalars(stmt).unique()}


def current_prices(
    s: Session, selection_ids: Sequence[int], stale_after: timedelta
) -> dict[int, list[CurrentPrice]]:
    """Live (non-stale) prices per selection, keyed by selection id."""
    if not selection_ids:
        return {}
    cutoff = datetime.now(UTC) - stale_after
    rows = s.execute(
        select(
            OddsCurrent.selection_id,
            OddsCurrent.bookmaker_id,
            Bookmaker.key,
            OddsCurrent.price,
            OddsCurrent.price_since,
            OddsCurrent.last_seen_at,
        )
        .join(Bookmaker, Bookmaker.id == OddsCurrent.bookmaker_id)
        .where(
            OddsCurrent.selection_id.in_(selection_ids),
            OddsCurrent.last_seen_at >= cutoff,
            Bookmaker.active.is_(True),
        )
        .order_by(OddsCurrent.selection_id, Bookmaker.key)
    ).all()
    out: dict[int, list[CurrentPrice]] = defaultdict(list)
    for sel_id, book_id, book_key, price, since, seen in rows:
        out[sel_id].append(CurrentPrice(book_id, book_key, float(price), since, seen))
    return out


def players_by_id(s: Session, ids: set[int]) -> dict[int, Player]:
    return {p.id: p for p in s.scalars(select(Player).where(Player.id.in_(ids)))} if ids else {}


def teams_by_id(s: Session, ids: set[int]) -> dict[int, Team]:
    return {t.id: t for t in s.scalars(select(Team).where(Team.id.in_(ids)))} if ids else {}


def bookmakers_by_id(s: Session) -> dict[int, Bookmaker]:
    return {b.id: b for b in s.scalars(select(Bookmaker))}


# --- history ------------------------------------------------------------------------------------


def selection_with_context(s: Session, selection_id: int) -> Selection | None:
    return s.scalars(
        select(Selection).options(joinedload(Selection.market)).where(Selection.id == selection_id)
    ).one_or_none()


def observations(
    s: Session, selection_id: int, since: datetime | None, bookmaker_key: str | None
) -> list[tuple[str, float, datetime]]:
    stmt = (
        select(Bookmaker.key, OddsObservation.price, OddsObservation.observed_at)
        .join(Bookmaker, Bookmaker.id == OddsObservation.bookmaker_id)
        .where(OddsObservation.selection_id == selection_id)
        .order_by(Bookmaker.key, OddsObservation.observed_at)
    )
    if since:
        stmt = stmt.where(OddsObservation.observed_at >= since)
    if bookmaker_key:
        stmt = stmt.where(Bookmaker.key == bookmaker_key)
    return [(k, float(p), t) for k, p, t in s.execute(stmt).all()]


@dataclass(frozen=True)
class MovementRow:
    selection_id: int
    market_id: int
    fixture_id: int
    bookmaker_key: str
    opening_price: float
    current_price: float
    opened_at: datetime
    updated_at: datetime
    observations: int


def movements(
    s: Session,
    fixture_filters: FixtureFilters,
    market_types: list[str] | None,
    since: datetime,
    min_observations: int,
    limit: int,
) -> list[MovementRow]:
    """Opening vs current price per selection/bookmaker within a window, largest implied shift first.

    One grouped pass over the window: ordered ``array_agg`` picks the first and last price per pair.
    """
    opening = func.array_agg(aggregate_order_by(OddsObservation.price, OddsObservation.observed_at.asc()))[1]
    current = func.array_agg(aggregate_order_by(OddsObservation.price, OddsObservation.observed_at.desc()))[1]
    stmt = (
        select(
            OddsObservation.selection_id,
            Selection.market_id,
            Market.fixture_id,
            Bookmaker.key,
            opening,
            current,
            func.min(OddsObservation.observed_at),
            func.max(OddsObservation.observed_at),
            func.count(),
        )
        .join(Selection, Selection.id == OddsObservation.selection_id)
        .join(Market, Market.id == Selection.market_id)
        .join(Fixture, Fixture.id == Market.fixture_id)
        .join(Bookmaker, Bookmaker.id == OddsObservation.bookmaker_id)
        .where(OddsObservation.observed_at >= since)
        .group_by(OddsObservation.selection_id, Selection.market_id, Market.fixture_id, Bookmaker.key)
        .having(func.count() >= min_observations)
        .order_by(func.abs(opening / current - 1).desc())
        .limit(limit)
    )
    stmt = _apply_fixture_filters(stmt, fixture_filters)
    if market_types:
        stmt = stmt.where(Market.market_type.in_(market_types))
    return [
        MovementRow(r[0], r[1], r[2], r[3], float(r[4]), float(r[5]), r[6], r[7], int(r[8]))
        for r in s.execute(stmt).all()
    ]


def histories_for_pairs(
    s: Session, pairs: set[tuple[int, str]], since: datetime
) -> dict[tuple[int, str], list[tuple[float, datetime]]]:
    """Price series for (selection_id, bookmaker_key) pairs in one query."""
    if not pairs:
        return {}
    selection_ids = {sid for sid, _ in pairs}
    rows = s.execute(
        select(
            OddsObservation.selection_id, Bookmaker.key, OddsObservation.price, OddsObservation.observed_at
        )
        .join(Bookmaker, Bookmaker.id == OddsObservation.bookmaker_id)
        .where(OddsObservation.selection_id.in_(selection_ids), OddsObservation.observed_at >= since)
        .order_by(OddsObservation.selection_id, Bookmaker.key, OddsObservation.observed_at)
    ).all()
    out: dict[tuple[int, str], list[tuple[float, datetime]]] = defaultdict(list)
    for sid, key, price, at in rows:
        if (sid, key) in pairs:
            out[(sid, key)].append((float(price), at))
    return out
