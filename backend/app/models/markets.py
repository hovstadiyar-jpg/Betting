"""Markets, selections and the append-only odds observation history."""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.models.enums import MarketType, check_in
from app.models.fixtures import Fixture


class Market(TimestampMixin, Base):
    __tablename__ = "markets"
    __table_args__ = (
        # One market per fixture/type/line/subject. NULLS NOT DISTINCT (PostgreSQL 15+) treats a missing
        # line or subject as a value, so e.g. a fixture has exactly one "match_result" market.
        UniqueConstraint(
            "fixture_id",
            "market_type",
            "line",
            "player_id",
            "team_id",
            "stat",
            name="uq_markets_identity",
            postgresql_nulls_not_distinct=True,
        ),
        CheckConstraint(check_in("market_type", MarketType), name="market_type"),
        CheckConstraint(
            "(market_type <> 'player_prop' OR player_id IS NOT NULL) "
            "AND (market_type <> 'team_prop' OR team_id IS NOT NULL)",
            name="prop_subject",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    fixture_id: Mapped[int] = mapped_column(ForeignKey("fixtures.id", ondelete="CASCADE"), index=True)
    market_type: Mapped[str] = mapped_column(String(32))
    name: Mapped[str] = mapped_column(String(200))
    line: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    # Props only: the subject and the statistic (e.g. "Points", "Shots on Target").
    player_id: Mapped[int | None] = mapped_column(ForeignKey("players.id", ondelete="CASCADE"), index=True)
    team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.id", ondelete="CASCADE"))
    stat: Mapped[str | None] = mapped_column(String(64))

    fixture: Mapped[Fixture] = relationship()
    selections: Mapped[list["Selection"]] = relationship(back_populates="market", order_by="Selection.id")


class Selection(TimestampMixin, Base):
    __tablename__ = "selections"
    __table_args__ = (UniqueConstraint("market_id", "key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    market_id: Mapped[int] = mapped_column(ForeignKey("markets.id", ondelete="CASCADE"))
    key: Mapped[str] = mapped_column(String(64))  # "home", "draw", "away", "over", "under", "yes", "no"
    label: Mapped[str] = mapped_column(String(200))
    # Optional output of an internal pricing model (0-1). Null until a model is deployed.
    model_probability: Mapped[Decimal | None] = mapped_column(
        Numeric(6, 5),
        CheckConstraint("model_probability > 0 AND model_probability < 1", name="model_probability"),
    )

    market: Mapped[Market] = relationship(back_populates="selections")


class OddsObservation(Base):
    """A bookmaker's price for a selection at a point in time.

    Append-only: a row is written only when the price changes.
    """

    __tablename__ = "odds_observations"
    __table_args__ = (
        Index("ix_odds_obs_selection_book_time", "selection_id", "bookmaker_id", "observed_at"),
        Index("ix_odds_obs_observed_at", "observed_at"),
        CheckConstraint("price > 1", name="price"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    selection_id: Mapped[int] = mapped_column(ForeignKey("selections.id", ondelete="CASCADE"))
    bookmaker_id: Mapped[int] = mapped_column(ForeignKey("bookmakers.id", ondelete="CASCADE"))
    price: Mapped[Decimal] = mapped_column(Numeric(8, 3))  # decimal odds
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    sync_run_id: Mapped[int | None] = mapped_column(ForeignKey("provider_sync_runs.id", ondelete="SET NULL"))


class OddsCurrent(Base):
    """Latest known price per selection and bookmaker.

    ``price_since`` is when the bookmaker moved to this price; ``last_seen_at`` advances on every sync that
    still lists it. Prices whose ``last_seen_at`` falls behind are treated as withdrawn/suspended.
    """

    __tablename__ = "odds_current"
    __table_args__ = (
        Index("ix_odds_current_last_seen", "last_seen_at"),
        CheckConstraint("price > 1", name="price"),
    )

    selection_id: Mapped[int] = mapped_column(
        ForeignKey("selections.id", ondelete="CASCADE"), primary_key=True
    )
    bookmaker_id: Mapped[int] = mapped_column(
        ForeignKey("bookmakers.id", ondelete="CASCADE"), primary_key=True
    )
    price: Mapped[Decimal] = mapped_column(Numeric(8, 3))
    price_since: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
