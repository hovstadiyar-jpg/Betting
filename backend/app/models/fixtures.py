from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.models.enums import FixtureStatus, check_in
from app.models.reference import League, Team


class Fixture(TimestampMixin, Base):
    __tablename__ = "fixtures"
    __table_args__ = (
        Index("ix_fixtures_starts_at", "starts_at"),
        Index("ix_fixtures_league_starts_at", "league_id", "starts_at"),
        CheckConstraint(check_in("status", FixtureStatus), name="status"),
        CheckConstraint("home_team_id <> away_team_id", name="distinct_teams"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    league_id: Mapped[int] = mapped_column(ForeignKey("leagues.id", ondelete="RESTRICT"))
    home_team_id: Mapped[int] = mapped_column(ForeignKey("teams.id", ondelete="RESTRICT"))
    away_team_id: Mapped[int] = mapped_column(ForeignKey("teams.id", ondelete="RESTRICT"))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(16), default=FixtureStatus.SCHEDULED.value)
    # Which provider created/last refreshed this fixture ("the-odds-api", "demo", ...).
    data_source: Mapped[str] = mapped_column(String(64))

    league: Mapped[League] = relationship()
    home_team: Mapped[Team] = relationship(foreign_keys=[home_team_id])
    away_team: Mapped[Team] = relationship(foreign_keys=[away_team_id])
