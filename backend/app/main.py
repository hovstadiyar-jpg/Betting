"""FastAPI application factory. Run with: uvicorn app.main:app --reload"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import fixtures, health, odds, props, reference, sync, value
from app.core.config import get_settings
from app.core.logging import configure_logging

API_PREFIX = "/api/v1"

DESCRIPTION = """
Odds, props and value analytics for BettingValue.

* All endpoints are **read-only**. Data is loaded by the provider sync CLI (`python -m app.cli`).
* Every odds response carries `meta.sources`. `demo` means synthetic data, not real prices.
* Analytics only: no wagering, accounts or payments.
"""


def create_app() -> FastAPI:
    configure_logging()
    settings = get_settings()
    app = FastAPI(
        title="BettingValue API",
        version=health.VERSION,
        description=DESCRIPTION,
        openapi_tags=[
            {"name": "health", "description": "Liveness and readiness"},
            {"name": "reference", "description": "Sports, leagues and bookmakers"},
            {"name": "fixtures", "description": "Fixtures and per-fixture odds"},
            {"name": "odds", "description": "Current odds, history and movements"},
            {"name": "props", "description": "Player and team props"},
            {"name": "value", "description": "Value bet calculations"},
            {"name": "sync", "description": "Provider synchronisation audit log"},
        ],
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["GET"],
        allow_headers=["*"],
    )
    app.include_router(health.router)
    for router in (reference.router, fixtures.router, odds.router, props.router, value.router, sync.router):
        app.include_router(router, prefix=API_PREFIX)
    return app


app = create_app()
