"""Test setup: a dedicated PostgreSQL database, migrated with Alembic, truncated between tests.

Set TEST_DATABASE_URL to point at an empty database you are happy to wipe. Tests never touch DATABASE_URL.
"""

import os
from collections.abc import Iterator

import pytest

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://bettingvalue:bettingvalue@localhost:5432/bettingvalue_test"
)
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["ENVIRONMENT"] = "test"
os.environ.pop("ODDS_API_KEY", None)

from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.orm import Session, sessionmaker  # noqa: E402

from alembic import command  # noqa: E402
from app.core.config import get_settings  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.db.session import get_engine, get_sessionmaker  # noqa: E402

get_settings.cache_clear()
get_engine.cache_clear()
get_sessionmaker.cache_clear()


@pytest.fixture(scope="session", autouse=True)
def migrated_database() -> Iterator[None]:
    """Run every migration down and up once, so tests cover the real schema (not metadata.create_all)."""
    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    cfg.cmd_opts = None
    cfg.attributes["configure_logger"] = False
    os.environ["ALEMBIC_DB_URL"] = TEST_DATABASE_URL
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    yield


@pytest.fixture(autouse=True)
def clean_tables() -> Iterator[None]:
    yield
    tables = ", ".join(t.name for t in reversed(Base.metadata.sorted_tables))
    with get_engine().begin() as conn:
        conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))


@pytest.fixture
def session_factory() -> sessionmaker[Session]:
    return get_sessionmaker()


@pytest.fixture
def client() -> TestClient:
    from app.main import create_app

    return TestClient(create_app())
