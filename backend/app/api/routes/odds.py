from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from app.api.deps import AppSettings, DbSession, stale_after
from app.api.routes.fixtures import MAIN_TYPES
from app.models.enums import MarketType
from app.repositories import odds as repo
from app.schemas.api import (
    BookmakerSeries,
    MarketsPage,
    MovementOut,
    MovementsOut,
    PricePoint,
    SelectionHistoryOut,
    SelectionRef,
)
from app.services.odds_view import build_meta, fixture_out, market_ref, markets_out

router = APIRouter(prefix="/odds", tags=["odds"])


def markets_page(
    db: DbSession,
    settings: AppSettings,
    filters: repo.MarketFilters,
    limit: int,
    offset: int,
) -> MarketsPage:
    markets, total = repo.list_markets(db, filters, limit, offset)
    out, times = markets_out(db, markets, stale_after(settings), settings.value_min_books)
    fixtures = repo.fixtures_by_id(db, {m.fixture_id for m in markets})
    ordered = sorted(fixtures.values(), key=lambda f: (f.starts_at, f.id))
    return MarketsPage(
        items=out,
        fixtures=[fixture_out(f) for f in ordered],
        total=total,
        limit=limit,
        offset=offset,
        meta=build_meta({f.data_source for f in ordered}, times),
    )


@router.get("", response_model=MarketsPage, summary="Current odds for upcoming fixtures (main markets)")
def list_odds(
    db: DbSession,
    settings: AppSettings,
    sport: str | None = None,
    league: str | None = None,
    market_type: Annotated[list[MarketType] | None, Query()] = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> MarketsPage:
    filters = repo.MarketFilters(
        market_types=[t.value for t in market_type] if market_type else MAIN_TYPES,
        fixtures=repo.FixtureFilters(sport=sport, league=league),
    )
    return markets_page(db, settings, filters, limit, offset)


@router.get(
    "/history/{selection_id}",
    response_model=SelectionHistoryOut,
    summary="Historical price observations for a selection",
)
def selection_history(
    selection_id: int,
    db: DbSession,
    bookmaker: str | None = Query(default=None, description="Restrict to one bookmaker key"),
    hours: int = Query(default=72, ge=1, le=24 * 30, description="Look-back window"),
) -> SelectionHistoryOut:
    selection = repo.selection_with_context(db, selection_id)
    if selection is None:
        raise HTTPException(status_code=404, detail="Selection not found")
    fixture = repo.get_fixture(db, selection.market.fixture_id)
    if fixture is None:  # pragma: no cover - FK guarantees this
        raise HTTPException(status_code=404, detail="Fixture not found")
    since = datetime.now(UTC) - timedelta(hours=hours)
    series: dict[str, list[PricePoint]] = {}
    for book_key, price, observed_at in repo.observations(db, selection_id, since, bookmaker):
        series.setdefault(book_key, []).append(PricePoint(price=price, observed_at=observed_at))
    return SelectionHistoryOut(
        fixture=fixture_out(fixture),
        market=market_ref(selection.market),
        selection=SelectionRef(id=selection.id, key=selection.key, label=selection.label),
        series=[BookmakerSeries(bookmaker_key=k, points=v) for k, v in series.items()],
    )


@router.get("/movements", response_model=MovementsOut, summary="Largest price movements (opening vs current)")
def list_movements(
    db: DbSession,
    sport: str | None = None,
    league: str | None = None,
    market_type: Annotated[list[MarketType] | None, Query()] = None,
    hours: int = Query(default=48, ge=1, le=24 * 14),
    min_observations: int = Query(default=2, ge=2),
    limit: int = Query(default=50, ge=1, le=200),
    include_history: bool = Query(default=False, description="Embed each pair's price series"),
) -> MovementsOut:
    since = datetime.now(UTC) - timedelta(hours=hours)
    rows = repo.movements(
        db,
        repo.FixtureFilters(sport=sport, league=league),
        [t.value for t in market_type] if market_type else None,
        since,
        min_observations,
        limit,
    )
    fixtures = repo.fixtures_by_id(db, {r.fixture_id for r in rows})
    market_rows = repo.markets_by_id(db, {r.market_id for r in rows})
    histories = (
        repo.histories_for_pairs(db, {(r.selection_id, r.bookmaker_key) for r in rows}, since)
        if include_history
        else {}
    )
    items: list[MovementOut] = []
    for r in rows:
        market = market_rows[r.market_id]
        selection = next(s for s in market.selections if s.id == r.selection_id)
        items.append(
            MovementOut(
                fixture=fixture_out(fixtures[r.fixture_id]),
                market=market_ref(market),
                selection=SelectionRef(id=selection.id, key=selection.key, label=selection.label),
                bookmaker_key=r.bookmaker_key,
                opening_price=r.opening_price,
                current_price=r.current_price,
                implied_shift=r.opening_price / r.current_price - 1,
                opened_at=r.opened_at,
                updated_at=r.updated_at,
                observations=r.observations,
                history=[
                    PricePoint(price=p, observed_at=t)
                    for p, t in histories.get((r.selection_id, r.bookmaker_key), [])
                ]
                if include_history
                else None,
            )
        )
    return MovementsOut(
        items=items, meta=build_meta({f.data_source for f in fixtures.values()}, [r.updated_at for r in rows])
    )
