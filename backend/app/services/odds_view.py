"""Assembles API response models from repository results."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.models import Fixture, Market
from app.repositories import odds as repo
from app.schemas.api import (
    DataMeta,
    FixtureOut,
    LeagueRef,
    MarketOut,
    MarketRef,
    PlayerRef,
    PriceOut,
    SelectionOut,
    SelectionRef,
    TeamRef,
    ValueBetOut,
)
from app.services.value import FairMethod, SelectionPrices, consensus_probabilities, evaluate_market


def fixture_out(f: Fixture) -> FixtureOut:
    return FixtureOut(
        id=f.id,
        sport_key=f.league.sport.key,
        league=LeagueRef(key=f.league.key, name=f.league.name),
        home_team=TeamRef.model_validate(f.home_team),
        away_team=TeamRef.model_validate(f.away_team),
        starts_at=f.starts_at,
        status=f.status,
        data_source=f.data_source,
    )


def market_ref(m: Market) -> MarketRef:
    return MarketRef(
        id=m.id,
        market_type=m.market_type,
        name=m.name,
        line=float(m.line) if m.line is not None else None,
        stat=m.stat,
    )


def build_meta(sources: set[str], times: Sequence[datetime]) -> DataMeta:
    return DataMeta(
        sources=sorted(sources), last_updated=max(times) if times else None, generated_at=datetime.now(UTC)
    )


def markets_out(
    s: Session, markets: Sequence[Market], stale_after: timedelta, min_books: int
) -> tuple[list[MarketOut], list[datetime]]:
    selection_ids = [sel.id for m in markets for sel in m.selections]
    prices = repo.current_prices(s, selection_ids, stale_after)
    players = repo.players_by_id(s, {m.player_id for m in markets if m.player_id})
    teams = repo.teams_by_id(s, {m.team_id for m in markets if m.team_id})
    all_times: list[datetime] = []
    out: list[MarketOut] = []

    for m in markets:
        priced = [
            SelectionPrices(sel.id, {p.bookmaker_id: p.price for p in prices.get(sel.id, [])})
            for sel in m.selections
        ]
        consensus = consensus_probabilities(priced, min_books) or {}
        selections: list[SelectionOut] = []
        times: list[datetime] = []
        for sel in m.selections:
            sel_prices = prices.get(sel.id, [])
            best = max(sel_prices, key=lambda p: p.price, default=None)
            times.extend(p.last_seen_at for p in sel_prices)
            selections.append(
                SelectionOut(
                    id=sel.id,
                    key=sel.key,
                    label=sel.label,
                    prices=[
                        PriceOut(bookmaker_key=p.bookmaker_key, price=p.price, observed_at=p.observed_at)
                        for p in sel_prices
                    ],
                    best_price=best.price if best else None,
                    best_bookmaker_key=best.bookmaker_key if best else None,
                    consensus_probability=consensus.get(sel.id),
                    model_probability=float(sel.model_probability)
                    if sel.model_probability is not None
                    else None,
                )
            )
        player = players.get(m.player_id) if m.player_id else None
        team = teams.get(m.team_id) if m.team_id else None
        all_times.extend(times)
        out.append(
            MarketOut(
                id=m.id,
                fixture_id=m.fixture_id,
                market_type=m.market_type,
                name=m.name,
                line=float(m.line) if m.line is not None else None,
                stat=m.stat,
                player=PlayerRef.model_validate(player) if player else None,
                team=TeamRef.model_validate(team) if team else None,
                selections=selections,
                last_updated=max(times) if times else None,
            )
        )
    return out, all_times


def value_bets(
    s: Session,
    filters: repo.MarketFilters,
    method: FairMethod,
    min_ev: float,
    min_books: int,
    stale_after: timedelta,
) -> tuple[list[ValueBetOut], set[str], list[datetime]]:
    markets, _ = repo.list_markets(s, filters, limit=None)
    prices = repo.current_prices(s, [sel.id for m in markets for sel in m.selections], stale_after)
    books = repo.bookmakers_by_id(s)
    fixtures = repo.fixtures_by_id(s, {m.fixture_id for m in markets})

    results: list[ValueBetOut] = []
    sources: set[str] = set()
    times: list[datetime] = []
    for m in markets:
        sel_by_id = {sel.id: sel for sel in m.selections}
        price_rows = {sel.id: {p.bookmaker_id: p for p in prices.get(sel.id, [])} for sel in m.selections}
        priced = [
            SelectionPrices(
                sel.id,
                {b: p.price for b, p in price_rows[sel.id].items()},
                float(sel.model_probability) if sel.model_probability is not None else None,
            )
            for sel in m.selections
        ]
        evaluated, _ = evaluate_market(priced, method=method, min_books=min_books)
        fixture = fixtures.get(m.fixture_id)
        if fixture is None:
            continue
        for r in evaluated:
            if r.ev < min_ev:
                continue
            sel = sel_by_id[r.selection_id]
            book = books[r.best_bookmaker_id]
            best_row = price_rows[sel.id][r.best_bookmaker_id]
            observed = best_row.observed_at
            sources.add(fixture.data_source)
            times.append(best_row.last_seen_at)
            results.append(
                ValueBetOut(
                    fixture=fixture_out(fixture),
                    market=market_ref(m),
                    selection=SelectionRef(id=sel.id, key=sel.key, label=sel.label),
                    best_price=r.best_price,
                    bookmaker_key=book.key,
                    bookmaker_name=book.name,
                    fair_probability=r.fair_probability,
                    fair_odds=r.fair_odds,
                    implied_probability=r.implied_probability,
                    ev=r.ev,
                    method=r.method,
                    books_used=r.books_used,
                    observed_at=observed,
                )
            )
    results.sort(key=lambda v: v.ev, reverse=True)
    return results, sources, times
