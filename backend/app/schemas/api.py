"""Pydantic response models. These define the public API contract (and the OpenAPI schema)."""

from datetime import datetime
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class ApiModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(ApiModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int


class DataMeta(ApiModel):
    """Freshness and provenance of a response, so clients can label synthetic or stale data."""

    sources: list[str] = Field(
        description='Data sources contributing to the response, e.g. ["the-odds-api"] or ["demo"]'
    )
    last_updated: datetime | None = Field(
        description="When the newest price in the response was last confirmed by a provider sync"
    )
    generated_at: datetime


# --- health -------------------------------------------------------------------------------------


class HealthOut(ApiModel):
    status: Literal["ok"]
    version: str


class SyncSummary(ApiModel):
    provider: str
    status: str
    started_at: datetime
    finished_at: datetime | None


class ReadyOut(ApiModel):
    status: Literal["ready", "degraded"]
    database: Literal["ok", "unavailable"]
    schema_version: str | None
    latest_sync: SyncSummary | None


class SyncRunOut(ApiModel):
    id: int
    provider: str
    scope: str
    status: str
    started_at: datetime
    finished_at: datetime | None
    events_seen: int
    markets_upserted: int
    observations_inserted: int
    requests_remaining: int | None
    error: str | None


# --- reference ----------------------------------------------------------------------------------


class SportOut(ApiModel):
    key: str
    name: str
    active: bool
    league_count: int


class LeagueOut(ApiModel):
    key: str
    name: str
    sport_key: str
    region: str | None
    active: bool
    upcoming_fixtures: int


class TeamRef(ApiModel):
    id: int
    name: str
    short_name: str | None


class PlayerRef(ApiModel):
    id: int
    name: str
    team_id: int | None


class TeamOut(ApiModel):
    id: int
    name: str
    short_name: str | None
    sport_key: str
    league_key: str | None


class PlayerOut(ApiModel):
    id: int
    name: str
    position: str | None
    sport_key: str
    team_id: int | None


class BookmakerOut(ApiModel):
    key: str
    name: str
    region: str | None


class LeagueRef(ApiModel):
    key: str
    name: str


class FixtureOut(ApiModel):
    id: int
    sport_key: str
    league: LeagueRef
    home_team: TeamRef
    away_team: TeamRef
    starts_at: datetime
    status: str
    data_source: str


# --- odds ---------------------------------------------------------------------------------------


class PriceOut(ApiModel):
    bookmaker_key: str
    price: float
    observed_at: datetime


class SelectionOut(ApiModel):
    id: int
    key: str
    label: str
    prices: list[PriceOut]
    best_price: float | None
    best_bookmaker_key: str | None
    consensus_probability: float | None = Field(
        description="Average no-vig probability across complete books"
    )
    model_probability: float | None


class MarketOut(ApiModel):
    id: int
    fixture_id: int
    market_type: str
    name: str
    line: float | None
    stat: str | None
    player: PlayerRef | None
    team: TeamRef | None
    selections: list[SelectionOut]
    last_updated: datetime | None


class FixtureOddsOut(ApiModel):
    fixture: FixtureOut
    markets: list[MarketOut]
    meta: DataMeta


class MarketsPage(ApiModel):
    items: list[MarketOut]
    fixtures: list[FixtureOut]
    total: int
    limit: int
    offset: int
    meta: DataMeta


# --- value --------------------------------------------------------------------------------------


class MarketRef(ApiModel):
    id: int
    market_type: str
    name: str
    line: float | None
    stat: str | None


class SelectionRef(ApiModel):
    id: int
    key: str
    label: str


class ValueBetOut(ApiModel):
    fixture: FixtureOut
    market: MarketRef
    selection: SelectionRef
    best_price: float
    bookmaker_key: str
    bookmaker_name: str
    fair_probability: float
    fair_odds: float
    implied_probability: float
    ev: float = Field(description="Expected value per unit stake (0.05 = +5%)")
    method: Literal["consensus", "model"]
    books_used: int
    observed_at: datetime


class ValueBetsOut(ApiModel):
    items: list[ValueBetOut]
    total: int
    meta: DataMeta


# --- history ------------------------------------------------------------------------------------


class PricePoint(ApiModel):
    price: float
    observed_at: datetime


class BookmakerSeries(ApiModel):
    bookmaker_key: str
    points: list[PricePoint]


class SelectionHistoryOut(ApiModel):
    fixture: FixtureOut
    market: MarketRef
    selection: SelectionRef
    series: list[BookmakerSeries]


class MovementOut(ApiModel):
    fixture: FixtureOut
    market: MarketRef
    selection: SelectionRef
    bookmaker_key: str
    opening_price: float
    current_price: float
    implied_shift: float = Field(description="opening / current - 1; positive = price shortened")
    opened_at: datetime
    updated_at: datetime
    observations: int
    history: list[PricePoint] | None = Field(default=None, description="Present when include_history=true")


class MovementsOut(ApiModel):
    items: list[MovementOut]
    meta: DataMeta
