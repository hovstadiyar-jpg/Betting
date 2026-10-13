"""Provider-neutral data transfer objects.

Every odds source (a licensed API, the demo generator, a future feed) converts its payload into these
structures. The ingestion layer only ever sees these, so adding a provider never touches the database code.
"""

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Protocol

from app.models.enums import FixtureStatus, MarketType


class ProviderError(RuntimeError):
    """A provider request failed (bad credentials, quota exhausted, network error...)."""


@dataclass(frozen=True)
class NormalizedBookmaker:
    key: str
    name: str
    region: str | None = None


@dataclass(frozen=True)
class NormalizedPrice:
    bookmaker_key: str
    price: Decimal
    observed_at: datetime


@dataclass
class NormalizedSelection:
    key: str
    label: str
    prices: list[NormalizedPrice] = field(default_factory=list)


@dataclass
class NormalizedMarket:
    market_type: MarketType
    name: str
    selections: list[NormalizedSelection]
    line: Decimal | None = None
    stat: str | None = None
    player_name: str | None = None
    # Team prop subject, or (for player props) the player's team when the provider knows it.
    team_name: str | None = None

    @property
    def identity(self) -> tuple[str, Decimal | None, str | None, str | None, str | None]:
        return (self.market_type.value, self.line, self.stat, self.player_name, self.team_name)


@dataclass
class NormalizedEvent:
    external_id: str
    sport_key: str
    sport_name: str
    league_key: str
    league_name: str
    home_team: str
    away_team: str
    starts_at: datetime
    markets: list[NormalizedMarket]
    league_region: str | None = None
    status: FixtureStatus = FixtureStatus.SCHEDULED


@dataclass
class FetchResult:
    scope: str
    events: list[NormalizedEvent]
    bookmakers: list[NormalizedBookmaker]
    requests_used: int | None = None
    requests_remaining: int | None = None


class OddsProvider(Protocol):
    """A source of fixtures and prices."""

    name: str
    # Value stored on fixtures.data_source; lets the API/UI label synthetic data honestly.
    data_source: str

    def fetch(self, league_keys: list[str] | None = None) -> FetchResult: ...
