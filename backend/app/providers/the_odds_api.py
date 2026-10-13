"""Adapter for The Odds API v4 (https://the-odds-api.com).

The Odds API is a licensed odds aggregator with a free tier. It requires an API key (``ODDS_API_KEY``).
Quota cost per request = number of markets x number of regions; responses report usage in headers.

Endpoints used:
* ``GET /sports``                                   - list of competitions (free)
* ``GET /sports/{sport}/odds``                      - featured markets (h2h, totals, spreads)
* ``GET /sports/{sport}/events/{event_id}/odds``    - additional markets such as player props

Bookmaker coverage depends on the requested regions and on the provider's licensing; this adapter
does not add or imply coverage of any bookmaker the provider does not return.
"""

from __future__ import annotations

import logging
from collections.abc import Iterable
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

import httpx

from app.models.enums import FixtureStatus, MarketType
from app.providers.base import (
    FetchResult,
    NormalizedBookmaker,
    NormalizedEvent,
    NormalizedMarket,
    NormalizedPrice,
    NormalizedSelection,
    ProviderError,
)

log = logging.getLogger(__name__)

PROVIDER_NAME = "the-odds-api"

# Sport-key prefix -> (internal sport key, display name)
SPORT_PREFIXES: dict[str, tuple[str, str]] = {
    "soccer": ("football", "Football"),
    "basketball": ("basketball", "Basketball"),
    "icehockey": ("ice-hockey", "Ice Hockey"),
    "americanfootball": ("american-football", "American Football"),
    "baseball": ("baseball", "Baseball"),
    "tennis": ("tennis", "Tennis"),
    "cricket": ("cricket", "Cricket"),
    "rugbyleague": ("rugby-league", "Rugby League"),
    "rugbyunion": ("rugby-union", "Rugby Union"),
    "aussierules": ("aussie-rules", "Aussie Rules"),
    "mma": ("mma", "Mixed Martial Arts"),
    "boxing": ("boxing", "Boxing"),
}

# Player prop market keys -> statistic label. Only Over/Under and Yes/No outcome shapes are supported.
PLAYER_PROP_STATS: dict[str, str] = {
    "player_points": "Points",
    "player_rebounds": "Rebounds",
    "player_assists": "Assists",
    "player_threes": "Threes Made",
    "player_blocks": "Blocks",
    "player_steals": "Steals",
    "player_points_rebounds_assists": "Pts + Reb + Ast",
    "player_shots_on_goal": "Shots on Goal",
    "player_shots_on_target": "Shots on Target",
    "player_shots": "Shots",
    "player_goal_scorer_anytime": "Anytime Goalscorer",
    "player_assists_soccer": "Assists",
}
TEAM_PROP_STATS: dict[str, str] = {"team_totals": "Team Total"}


def sport_for(sport_key: str) -> tuple[str, str]:
    prefix = sport_key.split("_", 1)[0]
    if prefix in SPORT_PREFIXES:
        return SPORT_PREFIXES[prefix]
    return prefix, prefix.replace("-", " ").title()


def _parse_time(value: str | None) -> datetime:
    if not value:
        return datetime.now(UTC)
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _decimal(value: Any) -> Decimal | None:
    try:
        d = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None
    return d if d.is_finite() else None


def _fmt_line(point: Decimal) -> str:
    text = format(point.normalize(), "f")
    return f"+{text}" if point > 0 else text


class _MarketBuilder:
    """Collects outcomes from many bookmakers into one NormalizedMarket per (type, line, subject)."""

    def __init__(self) -> None:
        self.markets: dict[tuple[Any, ...], NormalizedMarket] = {}

    def add(
        self,
        template: NormalizedMarket,
        selection_key: str,
        selection_label: str,
        price: NormalizedPrice,
    ) -> None:
        market = self.markets.get(template.identity)
        if market is None:
            market = template
            self.markets[template.identity] = market
        selection = next((s for s in market.selections if s.key == selection_key), None)
        if selection is None:
            selection = NormalizedSelection(key=selection_key, label=selection_label)
            market.selections.append(selection)
        selection.prices.append(price)


def normalize_event(raw: dict[str, Any]) -> NormalizedEvent | None:
    """Convert one event object (from /odds or /events/{id}/odds) into a NormalizedEvent."""
    try:
        sport_key: str = raw["sport_key"]
        home: str = raw["home_team"]
        away: str = raw["away_team"]
        event_id: str = raw["id"]
    except KeyError:
        log.warning("Skipping malformed event payload")
        return None
    if not home or not away:
        return None  # outrights / futures are not fixtures

    internal_sport, sport_name = sport_for(sport_key)
    starts_at = _parse_time(raw.get("commence_time"))
    builder = _MarketBuilder()

    for book in raw.get("bookmakers") or []:
        book_key = book.get("key")
        if not book_key:
            continue
        for market in book.get("markets") or []:
            observed_at = _parse_time(market.get("last_update") or book.get("last_update"))
            _add_market(builder, market, book_key, observed_at, home, away)

    # Keep only markets where at least two selections have prices.
    markets = [m for m in builder.markets.values() if len(m.selections) >= 2]
    status = FixtureStatus.LIVE if starts_at <= datetime.now(UTC) else FixtureStatus.SCHEDULED
    return NormalizedEvent(
        external_id=event_id,
        sport_key=internal_sport,
        sport_name=sport_name,
        league_key=sport_key,
        league_name=raw.get("sport_title") or sport_key,
        home_team=home,
        away_team=away,
        starts_at=starts_at,
        markets=markets,
        status=status,
    )


def _add_market(
    builder: _MarketBuilder,
    market: dict[str, Any],
    book_key: str,
    observed_at: datetime,
    home: str,
    away: str,
) -> None:
    key = market.get("key")
    outcomes: Iterable[dict[str, Any]] = market.get("outcomes") or []

    for outcome in outcomes:
        price = _decimal(outcome.get("price"))
        name = str(outcome.get("name") or "")
        if price is None or price <= 1 or not name:
            continue
        p = NormalizedPrice(bookmaker_key=book_key, price=price, observed_at=observed_at)
        point = _decimal(outcome.get("point"))

        if key == "h2h":
            three_way = any(o.get("name") == "Draw" for o in outcomes)
            mtype = MarketType.MATCH_RESULT if three_way else MarketType.MONEYLINE
            sel = "home" if name == home else "away" if name == away else "draw" if name == "Draw" else None
            if sel:
                label = "Draw" if sel == "draw" else name
                builder.add(
                    NormalizedMarket(mtype, "Match Result" if three_way else "Moneyline", []), sel, label, p
                )

        elif key == "totals" and point is not None and name.lower() in ("over", "under"):
            builder.add(
                NormalizedMarket(MarketType.TOTAL, f"Total {_fmt_line(point).lstrip('+')}", [], line=point),
                name.lower(),
                f"{name} {_fmt_line(point).lstrip('+')}",
                p,
            )

        elif key == "spreads" and point is not None and name in (home, away):
            home_line = point if name == home else -point
            builder.add(
                NormalizedMarket(MarketType.HANDICAP, f"Handicap {_fmt_line(home_line)}", [], line=home_line),
                "home" if name == home else "away",
                f"{name} {_fmt_line(point)}",
                p,
            )

        elif key in PLAYER_PROP_STATS or key in TEAM_PROP_STATS:
            subject = outcome.get("description")
            side = name.lower()
            if not subject or side not in ("over", "under", "yes", "no"):
                continue
            is_player = key in PLAYER_PROP_STATS
            stat = PLAYER_PROP_STATS.get(key) or TEAM_PROP_STATS[key]
            line_text = f" {_fmt_line(point).lstrip('+')}" if point is not None else ""
            builder.add(
                NormalizedMarket(
                    MarketType.PLAYER_PROP if is_player else MarketType.TEAM_PROP,
                    f"{subject} {stat}{line_text}",
                    [],
                    line=point,
                    stat=stat,
                    player_name=subject if is_player else None,
                    team_name=None if is_player else subject,
                ),
                side,
                f"{name}{line_text}",
                p,
            )


class TheOddsApiProvider:
    name = PROVIDER_NAME
    data_source = PROVIDER_NAME

    def __init__(
        self,
        api_key: str,
        base_url: str,
        regions: str,
        markets: str,
        prop_markets: str = "",
        max_prop_events: int = 0,
        timeout: float = 15.0,
        client: httpx.Client | None = None,
    ) -> None:
        if not api_key:
            raise ProviderError("ODDS_API_KEY is not configured")
        self._api_key = api_key
        self._regions = regions
        self._markets = markets
        self._prop_markets = prop_markets
        self._max_prop_events = max_prop_events
        self._client = client or httpx.Client(base_url=base_url, timeout=timeout)
        self.requests_used: int | None = None
        self.requests_remaining: int | None = None

    def _get(self, path: str, **params: str) -> Any:
        try:
            response = self._client.get(path, params={"apiKey": self._api_key, **params})
        except httpx.HTTPError as exc:  # network / timeout
            raise ProviderError(f"Request to The Odds API failed: {type(exc).__name__}") from exc

        used = response.headers.get("x-requests-used")
        remaining = response.headers.get("x-requests-remaining")
        if used is not None and used.isdigit():
            self.requests_used = int(used)
        if remaining is not None and remaining.isdigit():
            self.requests_remaining = int(remaining)

        if response.status_code == 401:
            raise ProviderError("The Odds API rejected the API key (401)")
        if response.status_code == 429:
            raise ProviderError("The Odds API quota or rate limit exceeded (429)")
        if response.status_code >= 400:
            # Never echo the request URL: it contains the API key.
            raise ProviderError(f"The Odds API returned HTTP {response.status_code}")
        return response.json()

    def list_competitions(self) -> list[dict[str, Any]]:
        data = self._get("/sports")
        return [s for s in data if isinstance(s, dict)]

    def fetch(self, league_keys: list[str] | None = None) -> FetchResult:
        if not league_keys:
            raise ProviderError(
                "Specify at least one competition key, e.g. soccer_epl (see `list-competitions`)"
            )

        events: list[NormalizedEvent] = []
        bookmakers: dict[str, NormalizedBookmaker] = {}

        for league in league_keys:
            payload = self._get(
                f"/sports/{league}/odds",
                regions=self._regions,
                markets=self._markets,
                oddsFormat="decimal",
                dateFormat="iso",
            )
            raw_events = [e for e in payload if isinstance(e, dict)]
            for raw in raw_events:
                for b in raw.get("bookmakers") or []:
                    if b.get("key"):
                        bookmakers.setdefault(
                            b["key"], NormalizedBookmaker(key=b["key"], name=b.get("title") or b["key"])
                        )
                event = normalize_event(raw)
                if event:
                    events.append(event)

            if self._prop_markets and self._max_prop_events > 0:
                for raw in raw_events[: self._max_prop_events]:
                    prop_payload = self._get(
                        f"/sports/{league}/events/{raw['id']}/odds",
                        regions=self._regions,
                        markets=self._prop_markets,
                        oddsFormat="decimal",
                        dateFormat="iso",
                    )
                    prop_event = normalize_event(prop_payload) if isinstance(prop_payload, dict) else None
                    if prop_event:
                        for b in prop_payload.get("bookmakers") or []:
                            if b.get("key"):
                                bookmakers.setdefault(
                                    b["key"],
                                    NormalizedBookmaker(key=b["key"], name=b.get("title") or b["key"]),
                                )
                        events.append(prop_event)

        scope = f"{','.join(league_keys)}:{self._markets}"
        if self._prop_markets and self._max_prop_events > 0:
            scope += f"+{self._prop_markets}"
        return FetchResult(
            scope=scope[:256],
            events=events,
            bookmakers=list(bookmakers.values()),
            requests_used=self.requests_used,
            requests_remaining=self.requests_remaining,
        )
