from fastapi import APIRouter, Response, status
from sqlalchemy import select, text

from app.api.deps import DbSession
from app.models import ProviderSyncRun
from app.schemas.api import HealthOut, ReadyOut, SyncSummary

router = APIRouter(tags=["health"])
VERSION = "0.2.0"


@router.get("/health", response_model=HealthOut, summary="Liveness probe")
def health() -> HealthOut:
    """Process is up. Does not touch the database."""
    return HealthOut(status="ok", version=VERSION)


@router.get(
    "/ready",
    response_model=ReadyOut,
    summary="Readiness probe",
    responses={503: {"model": ReadyOut, "description": "Database unavailable"}},
)
def ready(db: DbSession, response: Response) -> ReadyOut:
    """Database reachable and migrated; also reports the latest provider sync."""
    try:
        version = db.execute(text("SELECT version_num FROM alembic_version")).scalar_one_or_none()
        run = db.scalars(select(ProviderSyncRun).order_by(ProviderSyncRun.started_at.desc()).limit(1)).first()
    except Exception:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return ReadyOut(status="degraded", database="unavailable", schema_version=None, latest_sync=None)
    return ReadyOut(
        status="ready",
        database="ok",
        schema_version=version,
        latest_sync=SyncSummary.model_validate(run) if run else None,
    )
