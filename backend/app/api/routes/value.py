from typing import Annotated, Literal

from fastapi import APIRouter, Query

from app.api.deps import AppSettings, DbSession, stale_after
from app.models.enums import MarketType
from app.repositories import odds as repo
from app.schemas.api import ValueBetsOut
from app.services.odds_view import build_meta, value_bets

router = APIRouter(prefix="/value-bets", tags=["value"])


@router.get(
    "",
    response_model=ValueBetsOut,
    summary="Selections priced above their fair value",
    description=(
        "EV = fair probability x best available price - 1.\n\n"
        "* `consensus` - fair probability is the average no-vig probability across bookmakers that price "
        "the complete market (at least `min_books`).\n"
        "* `model` - uses a stored model probability; returns nothing until a model populates it.\n\n"
        "Results are informational analytics, not betting advice."
    ),
)
def list_value_bets(
    db: DbSession,
    settings: AppSettings,
    sport: str | None = None,
    league: str | None = None,
    fixture_id: int | None = None,
    market_type: Annotated[list[MarketType] | None, Query()] = None,
    method: Literal["consensus", "model"] = "consensus",
    min_ev: float = Query(default=0.0, ge=-1, le=10, description="Minimum EV as a fraction (0.02 = +2%)"),
    min_books: int | None = Query(default=None, ge=2, le=50),
    limit: int = Query(default=100, ge=1, le=500),
) -> ValueBetsOut:
    filters = repo.MarketFilters(
        fixture_id=fixture_id,
        market_types=[t.value for t in market_type] if market_type else None,
        fixtures=repo.FixtureFilters(sport=sport, league=league),
    )
    results, sources, times = value_bets(
        db, filters, method, min_ev, min_books or settings.value_min_books, stale_after(settings)
    )
    return ValueBetsOut(items=results[:limit], total=len(results), meta=build_meta(sources, times))
