from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import SyncStatus, check_in


class ProviderSyncRun(Base):
    """One execution of a provider synchronisation job, for auditing, freshness and quota tracking."""

    __tablename__ = "provider_sync_runs"
    __table_args__ = (
        Index("ix_sync_runs_provider_started", "provider", "started_at"),
        CheckConstraint(check_in("status", SyncStatus), name="status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    provider: Mapped[str] = mapped_column(String(64))
    scope: Mapped[str] = mapped_column(String(256))  # e.g. "soccer_epl:h2h,totals"
    status: Mapped[str] = mapped_column(String(16), default=SyncStatus.RUNNING.value)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    events_seen: Mapped[int] = mapped_column(Integer, default=0)
    markets_upserted: Mapped[int] = mapped_column(Integer, default=0)
    observations_inserted: Mapped[int] = mapped_column(Integer, default=0)
    requests_used: Mapped[int | None] = mapped_column(Integer)
    requests_remaining: Mapped[int | None] = mapped_column(Integer)
    error: Mapped[str | None] = mapped_column(Text)
