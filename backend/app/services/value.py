"""Value bet detection.

For every selection we compare the best available price with an estimate of the "fair" probability:

* ``consensus`` (default): the average no-vig probability across every bookmaker that prices the
  complete market. Requires at least ``min_books`` complete books. This works with real market data
  and needs no proprietary model.
* ``model``: the selection's stored ``model_probability`` (only when an internal model has written one).

The calculation is deliberately kept free of I/O so it can be unit-tested with plain numbers.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Literal

from app.services.odds_math import expected_value, fair_odds, implied_probability, no_vig_probabilities

FairMethod = Literal["consensus", "model"]


@dataclass(frozen=True)
class SelectionPrices:
    selection_id: int
    # bookmaker_id -> decimal price (latest observation)
    prices: Mapping[int, float]
    model_probability: float | None = None


@dataclass(frozen=True)
class ValueResult:
    selection_id: int
    best_price: float
    best_bookmaker_id: int
    fair_probability: float
    fair_odds: float
    implied_probability: float
    ev: float
    method: FairMethod
    books_used: int


def consensus_probabilities(market: Sequence[SelectionPrices], min_books: int) -> dict[int, float] | None:
    """Average no-vig probability per selection across books that price every selection in the market."""
    if len(market) < 2:
        return None
    common_books = set.intersection(*(set(s.prices) for s in market))
    if len(common_books) < min_books:
        return None
    totals = {s.selection_id: 0.0 for s in market}
    for book in common_books:
        probs = no_vig_probabilities([s.prices[book] for s in market])
        for s, p in zip(market, probs, strict=True):
            totals[s.selection_id] += p
    return {sid: total / len(common_books) for sid, total in totals.items()}


def evaluate_market(
    market: Sequence[SelectionPrices], method: FairMethod = "consensus", min_books: int = 3
) -> tuple[list[ValueResult], int]:
    """Return a ValueResult for every selection that can be priced, plus the number of books used."""
    if method == "consensus":
        fair = consensus_probabilities(market, min_books)
        if fair is None:
            return [], 0
        books_used = len(set.intersection(*(set(s.prices) for s in market)))
    else:
        fair = {s.selection_id: s.model_probability for s in market if s.model_probability is not None}
        books_used = 0

    results: list[ValueResult] = []
    for s in market:
        p = fair.get(s.selection_id)
        if p is None or not s.prices:
            continue
        book_id, price = max(s.prices.items(), key=lambda kv: kv[1])
        results.append(
            ValueResult(
                selection_id=s.selection_id,
                best_price=price,
                best_bookmaker_id=book_id,
                fair_probability=p,
                fair_odds=fair_odds(p),
                implied_probability=implied_probability(price),
                ev=expected_value(price, p),
                method=method,
                books_used=books_used or len(s.prices),
            )
        )
    return results, books_used
