"""Pure betting maths. Mirrors src/lib/domain/odds.ts in the frontend; keep the two in sync."""

from collections.abc import Sequence


def implied_probability(decimal_odds: float) -> float:
    if decimal_odds <= 1:
        return 1.0
    return 1.0 / decimal_odds


def fair_odds(probability: float) -> float:
    if probability <= 0:
        return float("inf")
    return 1.0 / probability


def expected_value(decimal_odds: float, probability: float) -> float:
    """EV per unit staked: p * odds - 1 (0.05 == +5%)."""
    return probability * decimal_odds - 1.0


def overround(prices: Sequence[float]) -> float:
    """Bookmaker margin for a complete market (0.05 == 5%)."""
    return sum(implied_probability(p) for p in prices) - 1.0


def no_vig_probabilities(prices: Sequence[float]) -> list[float]:
    """Remove the margin proportionally ("multiplicative" method)."""
    raw = [implied_probability(p) for p in prices]
    total = sum(raw)
    if total <= 0:
        raise ValueError("prices must be positive")
    return [p / total for p in raw]


def closing_line_value(taken_odds: float, closing_odds: float) -> float:
    return taken_odds / closing_odds - 1.0
