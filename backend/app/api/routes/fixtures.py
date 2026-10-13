from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from app.api.deps import AppSettings, DbSession, stale_after
from app.models.enums import FixtureStatus, MarketType
from app.repositories import odds as repo
from app.schemas.api import FixtureOddsOut, FixtureOut, Page
from app.services.odds_view import build_meta, fixture_out, markets_out

router = APIRouter(prefix="/fixtures", tags=["fixtures"])

PROP_TYPES = [MarketType.PLAYER_PROP.value, MarketType.TEAM_PROP.value]
MAIN_TYPES = [t.value for t in MarketType if t.value not in PROP_TYPES]


@router.get("", response_model=Page[FixtureOut], summary="List fixtures (upcoming by default)")
def list_fixtures(
    db: DbSession,
    sport: str | None = None,
    league: str | None = None,
    team_id: int | None = None,
    status: FixtureStatus | None = None,
    starts_after: Annotated[datetime | None, Query(alias="from")] = None,
    starts_before: Annotated[datetime | None, Query(alias="to")] = None,
    upcoming: bool = Query(default=True, description="Only scheduled/live fixtures that have not finished"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> Page[FixtureOut]:
    filters = repo.FixtureFilters(
        sport=sport,
        league=league,
        status=status,
        starts_after=starts_after,
        starts_before=starts_before,
        upcoming=upcoming,
        team_id=team_id,
    )
    fixtures, total = repo.list_fixtures(db, filters, limit, offset)
    return Page[FixtureOut](items=[fixture_out(f) for f in fixtures], total=total, limit=limit, offset=offset)


@router.get("/{fixture_id}", response_model=FixtureOut, summary="Get a fixture")
def get_fixture(fixture_id: int, db: DbSession) -> FixtureOut:
    fixture = repo.get_fixture(db, fixture_id)
    if fixture is None:
        raise HTTPException(status_code=404, detail="Fixture not found")
    return fixture_out(fixture)


@router.get(
    "/{fixture_id}/odds",
    response_model=FixtureOddsOut,
    summary="All markets and current prices for a fixture",
)
def fixture_odds(
    fixture_id: int,
    db: DbSession,
    settings: AppSettings,
    market_type: Annotated[list[MarketType] | None, Query()] = None,
    include_props: bool = Query(default=False, description="Include player and team prop markets"),
) -> FixtureOddsOut:
    fixture = repo.get_fixture(db, fixture_id)
    if fixture is None:
        raise HTTPException(status_code=404, detail="Fixture not found")
    types = [t.value for t in market_type] if market_type else (None if include_props else MAIN_TYPES)
    markets, _ = repo.list_markets(
        db, repo.MarketFilters(fixture_id=fixture_id, market_types=types), limit=None
    )
    out, times = markets_out(db, markets, stale_after(settings), settings.value_min_books)
    return FixtureOddsOut(
        fixture=fixture_out(fixture), markets=out, meta=build_meta({fixture.data_source}, times)
    )
