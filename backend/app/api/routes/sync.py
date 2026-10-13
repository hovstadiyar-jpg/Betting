from fastapi import APIRouter, Query
from sqlalchemy import select

from app.api.deps import DbSession
from app.models import ProviderSyncRun
from app.schemas.api import SyncRunOut

router = APIRouter(prefix="/sync", tags=["sync"])


@router.get(
    "/runs", response_model=list[SyncRunOut], summary="Recent provider synchronisation runs (read-only)"
)
def list_runs(
    db: DbSession, limit: int = Query(default=20, ge=1, le=100), provider: str | None = None
) -> list[SyncRunOut]:
    stmt = (
        select(ProviderSyncRun)
        .order_by(ProviderSyncRun.started_at.desc(), ProviderSyncRun.id.desc())
        .limit(limit)
    )
    if provider:
        stmt = stmt.where(ProviderSyncRun.provider == provider)
    return [SyncRunOut.model_validate(r) for r in db.scalars(stmt)]
