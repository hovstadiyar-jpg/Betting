import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from app.ingestion.sync import run_sync
from app.models import Fixture, Market, OddsCurrent, OddsObservation, Player, ProviderSyncRun
from app.providers.base import FetchResult, NormalizedBookmaker, ProviderError
from app.providers.demo import DemoProvider
from app.providers.the_odds_api import normalize_event

SAMPLE = json.loads((Path(__file__).parent / "fixtures" / "the_odds_api_sample.json").read_text())
AS_OF = datetime(2030, 3, 4, 10, 0, tzinfo=UTC)


class StaticProvider:
    """Feeds a fixed FetchResult (built from the recorded-shape sample) through the real ingestion path."""

    name = "the-odds-api"
    data_source = "the-odds-api"

    def __init__(self, events: list[dict[str, object]]) -> None:
        self.events = [e for e in (normalize_event(x) for x in events) if e]

    def fetch(self, league_keys: list[str] | None = None) -> FetchResult:
        books = [
            NormalizedBookmaker(k, k.replace("_", " ").title())
            for k in ("book_alpha", "book_beta", "book_gamma", "book_delta")
        ]
        return FetchResult(scope="sample", events=self.events, bookmakers=books, requests_remaining=99)


def count(s: Session, model: type) -> int:
    return s.scalar(select(func.count()).select_from(model)) or 0


def test_demo_sync_is_idempotent_and_builds_history(session_factory: sessionmaker[Session]) -> None:
    run = run_sync(session_factory, DemoProvider(as_of=AS_OF), ["demo_premier_division"])
    assert run.status == "succeeded"
    assert run.events_seen > 0 and run.observations_inserted > 0

    with session_factory() as s:
        first_obs = count(s, OddsObservation)
        assert count(s, OddsCurrent) == first_obs  # first sync: one observation per (selection, book)
        assert s.scalars(select(Fixture.data_source).distinct()).all() == ["demo"]
        # Player props link players to their team.
        assert s.scalar(select(func.count()).select_from(Player).where(Player.team_id.is_(None))) == 0

    again = run_sync(session_factory, DemoProvider(as_of=AS_OF), ["demo_premier_division"])
    assert again.observations_inserted == 0

    later = run_sync(
        session_factory, DemoProvider(as_of=AS_OF + timedelta(hours=2)), ["demo_premier_division"]
    )
    assert later.observations_inserted > 0
    with session_factory() as s:
        assert count(s, OddsObservation) == first_obs + later.observations_inserted
        assert count(s, ProviderSyncRun) == 3


def test_odds_api_shape_ingests_markets_and_props(session_factory: sessionmaker[Session]) -> None:
    run = run_sync(session_factory, StaticProvider(SAMPLE), None)
    assert run.status == "succeeded" and run.requests_remaining == 99
    with session_factory() as s:
        types = dict(s.execute(select(Market.market_type, func.count()).group_by(Market.market_type)).all())
        assert types == {
            "match_result": 1,
            "total": 2,
            "handicap": 1,
            "moneyline": 1,
            "player_prop": 1,
            "team_prop": 1,
        }
        prop_player = s.scalars(select(Player)).one()
        assert prop_player.name == "Sam Rivers" and prop_player.team_id is None  # provider gives no team


def test_failed_sync_is_recorded(session_factory: sessionmaker[Session]) -> None:
    class Broken:
        name = "broken"
        data_source = "broken"

        def fetch(self, league_keys: list[str] | None = None) -> FetchResult:
            raise ProviderError("upstream unavailable")

    with pytest.raises(ProviderError):
        run_sync(session_factory, Broken(), ["x"])
    with session_factory() as s:
        run = s.scalars(select(ProviderSyncRun)).one()
        assert run.status == "failed" and run.error == "upstream unavailable" and run.finished_at is not None


def test_stale_fixtures_are_closed(session_factory: sessionmaker[Session]) -> None:
    run_sync(session_factory, DemoProvider(as_of=AS_OF), ["demo_elite_hockey"])
    with session_factory() as s, s.begin():
        fixture = s.scalars(select(Fixture).limit(1)).one()
        fixture.starts_at = datetime.now(UTC) - timedelta(days=1)  # finished long ago, still "scheduled"
        fixture_id = fixture.id
    # A later sync of another league does not re-list that fixture, but closes stale ones for the source.
    run_sync(session_factory, DemoProvider(as_of=AS_OF), ["demo_premier_division"])
    with session_factory() as s:
        assert s.get_one(Fixture, fixture_id).status == "finished"
        assert s.scalar(select(func.count()).select_from(Fixture).where(Fixture.status == "finished")) == 1
