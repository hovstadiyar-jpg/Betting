"""Deterministic synthetic odds provider.

Lets the whole stack (database, ingestion, API, frontend) run end-to-end without an API key.
Everything it produces is fictional and is stored with ``data_source = "demo"`` so the API and UI
can label it. Prices drift slowly with time, so repeated syncs build a realistic observation history.
"""

from __future__ import annotations

import hashlib
import math
import random
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

from app.models.enums import FixtureStatus, MarketType
from app.providers.base import (
    FetchResult,
    NormalizedBookmaker,
    NormalizedEvent,
    NormalizedMarket,
    NormalizedPrice,
    NormalizedSelection,
)

PROVIDER_NAME = "demo"

BOOKMAKERS = [
    NormalizedBookmaker(key=f"demo-book-{c}", name=f"Demo Book {c.upper()}", region="demo") for c in "abcdef"
]


@dataclass(frozen=True)
class DemoLeague:
    sport_key: str
    sport_name: str
    name: str
    teams: tuple[str, ...]


LEAGUES: dict[str, DemoLeague] = {
    "demo_premier_division": DemoLeague(
        "football",
        "Football",
        "Premier Division (Demo)",
        (
            "Northbridge FC",
            "Kingsport United",
            "Ashford Rovers",
            "Redcliffe Athletic",
            "Harrow Vale",
            "Westmere City",
            "Stonegate Town",
            "Brightwater Albion",
        ),
    ),
    "demo_liga_primera": DemoLeague(
        "football",
        "Football",
        "Liga Primera (Demo)",
        (
            "Real Costa Verde",
            "Atletico Sierra",
            "CD Puerto Alto",
            "Valle Oscuro CF",
            "UD Montana",
            "Deportivo Arena",
            "Sporting Lago",
            "Racing Mirador",
        ),
    ),
    "demo_pro_basketball": DemoLeague(
        "basketball",
        "Basketball",
        "Pro Basketball League (Demo)",
        (
            "Harbor City Hawks",
            "Summit Peaks",
            "Ironwood Titans",
            "Lakeshore Lynx",
            "Desert Vipers",
            "Capital Comets",
            "Riverside Royals",
            "Metro Monarchs",
        ),
    ),
    "demo_elite_hockey": DemoLeague(
        "ice-hockey",
        "Ice Hockey",
        "Elite Hockey League (Demo)",
        (
            "Frostvale Wolves",
            "Polar Bay Bears",
            "Granite Falls Grizzlies",
            "Aurora Lights",
            "Cold Creek Kings",
            "Northern Pike",
        ),
    ),
}

PLAYER_FIRST = ["Aron", "Bastian", "Caleb", "Dario", "Elias", "Felix", "Gideon", "Hugo", "Isak", "Jonas"]
PLAYER_LAST = ["Halvorsen", "Marquez", "Okafor", "Lindqvist", "Brennan", "Castell", "Dorsey", "Ekstrom"]

PROP_STATS: dict[str, list[tuple[str, float]]] = {
    "football": [("Shots on Target", 1.4), ("Shots", 2.8)],
    "basketball": [("Points", 21.0), ("Rebounds", 7.0), ("Assists", 5.5)],
    "ice-hockey": [("Shots on Goal", 3.1)],
}

TICK = timedelta(minutes=10)
Q = Decimal("0.01")


def _seed(*parts: object) -> int:
    digest = hashlib.sha256("|".join(map(str, parts)).encode()).digest()
    return int.from_bytes(digest[:8], "big")


def _rng(*parts: object) -> random.Random:
    return random.Random(_seed(*parts))  # noqa: S311 - not used for security


def _rating(team: str) -> float:
    return 55 + _rng("rating", team).random() * 37


def _price(p: float, margin: float, noise: float) -> Decimal:
    p = min(0.97, max(0.03, p * (1 + noise)))
    return Decimal(str(max(1.02, min(15.0, 1 / (p * (1 + margin)))))).quantize(Q, rounding=ROUND_HALF_UP)


def logistic(x: float) -> float:
    return 1 / (1 + math.exp(-x))


def _poisson_over(line: float, lam: float) -> float:
    k = math.floor(line)
    term = math.exp(-lam)
    cdf = term
    for i in range(1, k + 1):
        term *= lam / i
        cdf += term
    return min(0.96, max(0.04, 1 - cdf))


def _normal_over(line: float, mean: float, sd: float) -> float:
    return min(0.96, max(0.04, 0.5 * math.erfc((line - mean) / (sd * math.sqrt(2)))))


class DemoProvider:
    name = PROVIDER_NAME
    data_source = PROVIDER_NAME

    def __init__(self, as_of: datetime | None = None, days_ahead: int = 3) -> None:
        self.as_of = as_of or datetime.now(UTC)
        self.days_ahead = days_ahead

    # A fixture schedule anchored to the current day, so demo fixtures are always upcoming.
    def _schedule(self, league_key: str, teams: list[str]) -> list[tuple[str, str, str, datetime]]:
        day0 = self.as_of.replace(hour=0, minute=0, second=0, microsecond=0)
        out = []
        for day in range(-1, self.days_ahead):
            date = day0 + timedelta(days=day)
            rng = _rng("schedule", league_key, date.date())
            order = teams[:]
            rng.shuffle(order)
            for i in range(0, len(order) - 1, 2):
                kickoff = date + timedelta(hours=12 + i * 1.25 + rng.choice([0, 0.5, 1.0]))
                event_id = f"{league_key}:{date.date()}:{i // 2}"
                out.append((event_id, order[i], order[i + 1], kickoff))
        # Only events that start within the window and have not finished (assume ~2.5h duration).
        return [e for e in out if e[3] + timedelta(hours=2.5) > self.as_of]

    def _prices(
        self, event_id: str, market_key: str, probs: dict[str, float]
    ) -> dict[str, list[NormalizedPrice]]:
        tick = int(self.as_of.timestamp() // TICK.total_seconds())
        observed_at = datetime.fromtimestamp(tick * TICK.total_seconds(), UTC)
        out: dict[str, list[NormalizedPrice]] = {k: [] for k in probs}
        for book in BOOKMAKERS:
            book_rng = _rng("book", event_id, market_key, book.key)
            if book_rng.random() < 0.1:  # not every book prices every market
                continue
            margin = 0.04 + book_rng.random() * 0.035
            for sel, p in probs.items():
                base = _rng("base", event_id, market_key, book.key, sel).gauss(0, 0.02)
                # Slow drift: a smooth function of time, unique per selection/book.
                phase = _rng("phase", event_id, market_key, sel).random() * 6.28
                drift = 0.025 * math.sin(tick / 9 + phase) + _rng(
                    "t", event_id, market_key, book.key, sel, tick // 3
                ).gauss(0, 0.004)
                out[sel].append(NormalizedPrice(book.key, _price(p, margin, base + drift), observed_at))
        return out

    def _market(
        self, event_id: str, template: NormalizedMarket, labels: dict[str, str], probs: dict[str, float]
    ) -> NormalizedMarket:
        key = "|".join(str(x) for x in template.identity)
        prices = self._prices(event_id, key, probs)
        template.selections = [NormalizedSelection(k, labels[k], prices[k]) for k in probs if prices[k]]
        return template

    def _event(
        self, league_key: str, cfg: DemoLeague, event_id: str, home: str, away: str, starts: datetime
    ) -> NormalizedEvent:
        sport_key, sport_name = cfg.sport_key, cfg.sport_name
        diff = (_rating(home) - _rating(away)) / 100
        markets: list[NormalizedMarket] = []

        if sport_key == "football":
            draw = min(0.3, max(0.18, 0.27 - abs(diff) * 0.25))
            hs = logistic(diff * 6 + 0.25)
            lam = 2.6 + _rng("lam", event_id).gauss(0, 0.15)
            over = _poisson_over(2.5, lam)
            btts = (1 - math.exp(-lam * hs)) * (1 - math.exp(-lam * (1 - hs)))
            markets.append(
                self._market(
                    event_id,
                    NormalizedMarket(MarketType.MATCH_RESULT, "Match Result", []),
                    {"home": home, "draw": "Draw", "away": away},
                    {"home": (1 - draw) * hs, "draw": draw, "away": (1 - draw) * (1 - hs)},
                )
            )
            markets.append(
                self._market(
                    event_id,
                    NormalizedMarket(MarketType.TOTAL, "Total 2.5", [], line=Decimal("2.5")),
                    {"over": "Over 2.5", "under": "Under 2.5"},
                    {"over": over, "under": 1 - over},
                )
            )
            markets.append(
                self._market(
                    event_id,
                    NormalizedMarket(MarketType.BTTS, "Both Teams to Score", []),
                    {"yes": "Yes", "no": "No"},
                    {"yes": btts, "no": 1 - btts},
                )
            )
        elif sport_key == "basketball":
            ph = logistic(diff * 7 + 0.18)
            total = Decimal(math.floor(222 + _rng("tot", event_id).gauss(0, 5))) + Decimal("0.5")
            spread = Decimal(round(diff * 40 + 2.5)) - Decimal("0.5")
            markets.append(
                self._market(
                    event_id,
                    NormalizedMarket(MarketType.MONEYLINE, "Moneyline", []),
                    {"home": home, "away": away},
                    {"home": ph, "away": 1 - ph},
                )
            )
            markets.append(
                self._market(
                    event_id,
                    NormalizedMarket(MarketType.HANDICAP, f"Handicap {-spread:+}", [], line=-spread),
                    {"home": f"{home} {-spread:+}", "away": f"{away} {spread:+}"},
                    {"home": 0.5, "away": 0.5},
                )
            )
            markets.append(
                self._market(
                    event_id,
                    NormalizedMarket(MarketType.TOTAL, f"Total {total}", [], line=total),
                    {"over": f"Over {total}", "under": f"Under {total}"},
                    {"over": 0.5, "under": 0.5},
                )
            )
        else:
            ph = logistic(diff * 4.5 + 0.12)
            over = _poisson_over(5.5, 5.7 + _rng("lam", event_id).gauss(0, 0.3))
            markets.append(
                self._market(
                    event_id,
                    NormalizedMarket(MarketType.MONEYLINE, "Moneyline (incl. OT)", []),
                    {"home": home, "away": away},
                    {"home": ph, "away": 1 - ph},
                )
            )
            markets.append(
                self._market(
                    event_id,
                    NormalizedMarket(MarketType.TOTAL, "Total 5.5", [], line=Decimal("5.5")),
                    {"over": "Over 5.5", "under": "Under 5.5"},
                    {"over": over, "under": 1 - over},
                )
            )

        # Player props: two players per team, Over/Under on each sport's stats.
        for team in (home, away):
            for slot in range(2):
                prng = _rng("player", team, slot)
                player = f"{prng.choice(PLAYER_FIRST)} {prng.choice(PLAYER_LAST)}"
                for stat, base_mean in PROP_STATS[sport_key]:
                    mean = base_mean * (0.75 + prng.random() * 0.5)
                    line = Decimal(math.floor(mean)) + Decimal("0.5")
                    p_over = (
                        _poisson_over(float(line), mean)
                        if mean < 6
                        else _normal_over(float(line), mean, max(1.5, mean * 0.22))
                    )
                    markets.append(
                        self._market(
                            event_id,
                            NormalizedMarket(
                                MarketType.PLAYER_PROP,
                                f"{player} {stat} {line}",
                                [],
                                line=line,
                                stat=stat,
                                player_name=player,
                                team_name=team,
                            ),
                            {"over": f"Over {line}", "under": f"Under {line}"},
                            {"over": p_over, "under": 1 - p_over},
                        )
                    )
            # Team total prop.
            team_mean = {"football": 1.35, "basketball": 111.0, "ice-hockey": 2.9}[sport_key]
            tline = Decimal(math.floor(team_mean)) + Decimal("0.5")
            tp = (
                _poisson_over(float(tline), team_mean)
                if team_mean < 6
                else _normal_over(float(tline), team_mean, 10)
            )
            markets.append(
                self._market(
                    event_id,
                    NormalizedMarket(
                        MarketType.TEAM_PROP,
                        f"{team} Team Total {tline}",
                        [],
                        line=tline,
                        stat="Team Total",
                        team_name=team,
                    ),
                    {"over": f"Over {tline}", "under": f"Under {tline}"},
                    {"over": tp, "under": 1 - tp},
                )
            )

        status = FixtureStatus.LIVE if starts <= self.as_of else FixtureStatus.SCHEDULED
        return NormalizedEvent(
            external_id=event_id,
            sport_key=sport_key,
            sport_name=sport_name,
            league_key=league_key,
            league_name=cfg.name,
            league_region="Demo",
            home_team=home,
            away_team=away,
            starts_at=starts,
            markets=[m for m in markets if len(m.selections) >= 2],
            status=status,
        )

    def fetch(self, league_keys: list[str] | None = None) -> FetchResult:
        keys = league_keys or list(LEAGUES)
        events = []
        for key in keys:
            cfg = LEAGUES.get(key)
            if cfg is None:
                continue
            teams = list(cfg.teams)
            for event_id, home, away, starts in self._schedule(key, teams):
                events.append(self._event(key, cfg, event_id, home, away, starts))
        return FetchResult(scope=",".join(keys)[:256], events=events, bookmakers=BOOKMAKERS)
