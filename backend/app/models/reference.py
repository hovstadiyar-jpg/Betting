"""Reference entities: sports, leagues, teams, players, bookmakers and provider ID mappings."""

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.models.enums import EntityType, check_in


class Sport(TimestampMixin, Base):
    __tablename__ = "sports"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(64), unique=True)  # e.g. "football", "basketball"
    name: Mapped[str] = mapped_column(String(128))
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")

    leagues: Mapped[list["League"]] = relationship(back_populates="sport")


class League(TimestampMixin, Base):
    __tablename__ = "leagues"

    id: Mapped[int] = mapped_column(primary_key=True)
    sport_id: Mapped[int] = mapped_column(ForeignKey("sports.id", ondelete="RESTRICT"), index=True)
    key: Mapped[str] = mapped_column(String(128), unique=True)  # e.g. "soccer_epl"
    name: Mapped[str] = mapped_column(String(200))
    region: Mapped[str | None] = mapped_column(String(128))
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")

    sport: Mapped[Sport] = relationship(back_populates="leagues")


class Team(TimestampMixin, Base):
    __tablename__ = "teams"
    __table_args__ = (UniqueConstraint("sport_id", "name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    sport_id: Mapped[int] = mapped_column(ForeignKey("sports.id", ondelete="RESTRICT"), index=True)
    # Teams can appear in several competitions; this is the primary/home league when known.
    league_id: Mapped[int | None] = mapped_column(ForeignKey("leagues.id", ondelete="SET NULL"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    short_name: Mapped[str | None] = mapped_column(String(16))


class Player(TimestampMixin, Base):
    __tablename__ = "players"
    __table_args__ = (Index("ix_players_sport_name", "sport_id", "name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    sport_id: Mapped[int] = mapped_column(ForeignKey("sports.id", ondelete="RESTRICT"))
    team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.id", ondelete="SET NULL"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    position: Mapped[str | None] = mapped_column(String(64))


class Bookmaker(TimestampMixin, Base):
    __tablename__ = "bookmakers"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(64), unique=True)  # provider-agnostic slug, e.g. "williamhill"
    name: Mapped[str] = mapped_column(String(128))
    region: Mapped[str | None] = mapped_column(String(32))
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")


class ExternalRef(Base):
    """Maps a provider's identifier to an internal row, so several providers can feed one model."""

    __tablename__ = "external_refs"
    __table_args__ = (
        UniqueConstraint("provider", "entity_type", "external_id"),
        Index("ix_external_refs_entity", "entity_type", "entity_id"),
        CheckConstraint(check_in("entity_type", EntityType), name="entity_type"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    provider: Mapped[str] = mapped_column(String(64))
    entity_type: Mapped[str] = mapped_column(String(32))
    external_id: Mapped[str] = mapped_column(String(256))
    entity_id: Mapped[int]
