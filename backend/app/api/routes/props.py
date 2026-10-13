from fastapi import APIRouter, Query

from app.api.deps import AppSettings, DbSession
from app.api.routes.odds import markets_page
from app.models.enums import MarketType
from app.repositories import odds as repo
from app.schemas.api import MarketsPage

router = APIRouter(prefix="/props", tags=["props"])


def _filters(
    market_type: MarketType,
    sport: str | None,
    league: str | None,
    fixture_id: int | None,
    player_id: int | None,
    team_id: int | None,
    stat: str | None,
) -> repo.MarketFilters:
    return repo.MarketFilters(
        fixture_id=fixture_id,
        market_types=[market_type.value],
        player_id=player_id,
        team_id=team_id,
        stat=stat,
        fixtures=repo.FixtureFilters(sport=sport, league=league),
    )


@router.get("/players", response_model=MarketsPage, summary="Player prop markets with current prices")
def player_props(
    db: DbSession,
    settings: AppSettings,
    sport: str | None = None,
    league: str | None = None,
    fixture_id: int | None = None,
    player_id: int | None = None,
    team_id: int | None = Query(default=None, description="Players currently linked to this team"),
    stat: str | None = Query(default=None, description='e.g. "Points", "Shots on Target"'),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> MarketsPage:
    filters = _filters(MarketType.PLAYER_PROP, sport, league, fixture_id, player_id, team_id, stat)
    return markets_page(db, settings, filters, limit, offset)


@router.get("/teams", response_model=MarketsPage, summary="Team prop markets with current prices")
def team_props(
    db: DbSession,
    settings: AppSettings,
    sport: str | None = None,
    league: str | None = None,
    fixture_id: int | None = None,
    team_id: int | None = None,
    stat: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> MarketsPage:
    filters = _filters(MarketType.TEAM_PROP, sport, league, fixture_id, None, team_id, stat)
    return markets_page(db, settings, filters, limit, offset)
