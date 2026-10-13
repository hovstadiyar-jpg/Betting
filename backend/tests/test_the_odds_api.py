import json
from decimal import Decimal
from pathlib import Path

import httpx
import pytest

from app.models.enums import MarketType
from app.providers.base import ProviderError
from app.providers.the_odds_api import TheOddsApiProvider, normalize_event, sport_for

SAMPLE = json.loads((Path(__file__).parent / "fixtures" / "the_odds_api_sample.json").read_text())


def test_sport_mapping() -> None:
    assert sport_for("soccer_epl") == ("football", "Football")
    assert sport_for("icehockey_nhl") == ("ice-hockey", "Ice Hockey")
    assert sport_for("curling_world")[0] == "curling"


def test_normalize_soccer_event() -> None:
    event = normalize_event(SAMPLE[0])
    assert event is not None
    assert (event.sport_key, event.league_key, event.league_name) == ("football", "soccer_epl", "EPL")
    by_identity = {m.identity: m for m in event.markets}

    h2h = by_identity[("match_result", None, None, None, None)]
    assert [s.key for s in h2h.selections] == ["home", "away", "draw"]
    home = next(s for s in h2h.selections if s.key == "home")
    assert {p.bookmaker_key for p in home.prices} == {"book_alpha", "book_beta", "book_gamma", "book_delta"}

    # Totals at different lines become separate markets.
    assert ("total", Decimal("2.5"), None, None, None) in by_identity
    assert ("total", Decimal("3.0"), None, None, None) in by_identity
    assert len(by_identity[("total", Decimal("2.5"), None, None, None)].selections[0].prices) == 2

    spread = by_identity[("handicap", Decimal("-0.5"), None, None, None)]
    assert {s.key for s in spread.selections} == {"home", "away"}


def test_normalize_props_and_skip_outrights() -> None:
    event = normalize_event(SAMPLE[1])
    assert event is not None
    types = {m.market_type for m in event.markets}
    assert types == {MarketType.MONEYLINE, MarketType.PLAYER_PROP, MarketType.TEAM_PROP}
    prop = next(m for m in event.markets if m.market_type is MarketType.PLAYER_PROP)
    assert (prop.player_name, prop.stat, prop.line) == ("Sam Rivers", "Points", Decimal("24.5"))
    assert normalize_event(SAMPLE[2]) is None


def _provider(handler: httpx.MockTransport) -> TheOddsApiProvider:
    client = httpx.Client(base_url="https://example.test/v4", transport=handler)
    return TheOddsApiProvider("secret-key", "https://example.test/v4", "uk", "h2h,totals", client=client)


def test_fetch_reads_quota_headers_and_sends_params() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(
            200, json=SAMPLE[:1], headers={"x-requests-used": "12", "x-requests-remaining": "488"}
        )

    result = _provider(httpx.MockTransport(handler)).fetch(["soccer_epl"])
    assert len(result.events) == 1
    assert {b.key for b in result.bookmakers} == {"book_alpha", "book_beta", "book_gamma", "book_delta"}
    assert (result.requests_used, result.requests_remaining) == (12, 488)
    params = seen[0].url.params
    assert seen[0].url.path == "/v4/sports/soccer_epl/odds"
    assert (
        params["oddsFormat"] == "decimal" and params["regions"] == "uk" and params["markets"] == "h2h,totals"
    )


@pytest.mark.parametrize("status", [401, 429, 500])
def test_errors_never_leak_the_api_key(status: int) -> None:
    provider = _provider(httpx.MockTransport(lambda r: httpx.Response(status, json={"message": "nope"})))
    with pytest.raises(ProviderError) as exc:
        provider.fetch(["soccer_epl"])
    assert "secret-key" not in str(exc.value)
    assert str(status) in str(exc.value)


def test_requires_key_and_leagues() -> None:
    with pytest.raises(ProviderError):
        TheOddsApiProvider("", "https://x", "uk", "h2h")
    provider = _provider(httpx.MockTransport(lambda r: httpx.Response(200, json=[])))
    with pytest.raises(ProviderError):
        provider.fetch([])
