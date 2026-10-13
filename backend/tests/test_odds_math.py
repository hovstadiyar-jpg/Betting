import math

import pytest

from app.services.odds_math import (
    closing_line_value,
    expected_value,
    fair_odds,
    implied_probability,
    no_vig_probabilities,
    overround,
)
from app.services.value import SelectionPrices, consensus_probabilities, evaluate_market


def test_basic_conversions() -> None:
    assert implied_probability(2.0) == 0.5
    assert implied_probability(1.0) == 1.0
    assert fair_odds(0.25) == 4.0
    assert math.isinf(fair_odds(0))
    assert expected_value(2.2, 0.5) == pytest.approx(0.1)
    assert closing_line_value(2.1, 2.0) == pytest.approx(0.05)


def test_overround_and_no_vig() -> None:
    prices = [1.9, 1.9]
    assert overround(prices) == pytest.approx(2 / 1.9 - 1)
    assert no_vig_probabilities(prices) == pytest.approx([0.5, 0.5])
    probs = no_vig_probabilities([2.1, 3.4, 3.6])
    assert sum(probs) == pytest.approx(1)
    assert probs[0] > probs[1] > probs[2]


def test_consensus_requires_min_books_with_complete_market() -> None:
    market = [
        SelectionPrices(1, {10: 1.9, 11: 1.95, 12: 2.0}),
        SelectionPrices(2, {10: 1.9, 11: 1.85}),  # book 12 prices only one side
    ]
    assert consensus_probabilities(market, min_books=3) is None
    fair = consensus_probabilities(market, min_books=2)
    assert fair is not None
    assert sum(fair.values()) == pytest.approx(1)


def test_evaluate_market_picks_best_price_and_computes_ev() -> None:
    market = [
        SelectionPrices(1, {10: 1.90, 11: 1.92, 12: 2.10}),
        SelectionPrices(2, {10: 1.90, 11: 1.88, 12: 1.75}),
    ]
    results, books = evaluate_market(market, method="consensus", min_books=3)
    assert books == 3
    over = next(r for r in results if r.selection_id == 1)
    assert over.best_bookmaker_id == 12
    assert over.best_price == 2.10
    assert over.ev == pytest.approx(over.fair_probability * 2.10 - 1)
    assert over.ev > 0  # 2.10 beats a consensus fair price of roughly 1.97


def test_model_method_uses_stored_probability_only() -> None:
    market = [SelectionPrices(1, {10: 2.2}, model_probability=0.5), SelectionPrices(2, {10: 1.7})]
    results, _ = evaluate_market(market, method="model")
    assert [r.selection_id for r in results] == [1]
    assert results[0].ev == pytest.approx(0.1)


def test_database_url_accepts_provider_formats() -> None:
    from app.core.config import Settings

    neon = "postgresql://u:p@ep-x.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
    assert Settings(database_url=neon).database_url.startswith("postgresql+psycopg://u:p@ep-x.")
    assert Settings(database_url="postgres://u:p@h/db").database_url == "postgresql+psycopg://u:p@h/db"
    explicit = "postgresql+psycopg://u:p@h/db"
    assert Settings(database_url=explicit).database_url == explicit
