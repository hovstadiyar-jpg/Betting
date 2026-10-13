"""End-to-end health check for a local installation: ``python -m app.cli doctor``.

Checks configuration, PostgreSQL, migrations, stored data (real vs demo), the running API, the running
Next.js frontend and, optionally, The Odds API credentials. Secrets are never printed: database URLs are
shown without passwords and API keys only as "set" / "not set".
"""

from __future__ import annotations

import html
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models import Bookmaker, Fixture, OddsObservation, ProviderSyncRun

OK, WARN, FAIL = "OK", "WARN", "FAIL"


@dataclass
class Report:
    rows: list[tuple[str, str, str]] = field(default_factory=list)

    def add(self, status: str, check: str, detail: str = "") -> None:
        self.rows.append((status, check, detail))
        print(f"[{status:<4}] {check}{' - ' + detail if detail else ''}", flush=True)

    @property
    def failed(self) -> bool:
        return any(s == FAIL for s, _, _ in self.rows)


def safe_db_url(url: str) -> str:
    """Database URL with the password removed, e.g. postgresql+psycopg://user@host:5432/db."""
    try:
        return make_url(url).render_as_string(hide_password=True).replace(":***@", "@")
    except Exception:
        return "<unparseable DATABASE_URL>"


def _timed(fn: Callable[[], httpx.Response]) -> tuple[httpx.Response, float]:
    start = time.perf_counter()
    response = fn()
    return response, (time.perf_counter() - start) * 1000


def check_config(settings: Settings, r: Report) -> None:
    r.add(OK, "Environment", settings.environment)
    r.add(OK, "DATABASE_URL", safe_db_url(settings.database_url))
    has_key = settings.odds_api_key is not None and bool(settings.odds_api_key.get_secret_value())
    r.add(
        OK if has_key else WARN,
        "ODDS_API_KEY",
        "set" if has_key else "not set - live odds sync disabled (demo only)",
    )
    r.add(OK, "CORS_ORIGINS", ", ".join(settings.cors_origin_list) or "(none)")


def check_database(settings: Settings, r: Report) -> bool:
    engine = create_engine(settings.database_url, pool_pre_ping=True, connect_args={"connect_timeout": 10})
    try:
        with engine.connect() as conn:
            version_num = conn.execute(text("SHOW server_version_num")).scalar_one()
            version = conn.execute(text("SHOW server_version")).scalar_one()
            major = int(version_num) // 10000
            r.add(
                OK if major >= 15 else FAIL,
                "PostgreSQL connection",
                f"server {version}" + ("" if major >= 15 else " (15+ required)"),
            )

            head = ScriptDirectory.from_config(
                Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
            ).get_current_head()
            has_table = conn.execute(
                text("SELECT to_regclass('public.alembic_version') IS NOT NULL")
            ).scalar_one()
            current = (
                conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one_or_none()
                if has_table
                else None
            )
            if current == head:
                r.add(OK, "Migrations", f"at head ({head})")
            else:
                r.add(
                    FAIL,
                    "Migrations",
                    f"database at {current or 'none'}, code expects {head} - run: alembic upgrade head",
                )
                return False

        with Session(engine) as s:
            by_source = dict(
                s.execute(select(Fixture.data_source, func.count()).group_by(Fixture.data_source)).all()
            )
            if not by_source:
                r.add(
                    WARN,
                    "Stored fixtures",
                    "none - run `python -m app.cli sync-demo` or `sync --leagues ...`",
                )
            else:
                parts = [
                    f"{src}={n} ({'synthetic' if src == 'demo' else 'real'})"
                    for src, n in sorted(by_source.items())
                ]
                r.add(OK, "Stored fixtures", ", ".join(parts))
            r.add(
                OK,
                "Bookmakers / observations",
                f"{s.scalar(select(func.count()).select_from(Bookmaker))} / "
                f"{s.scalar(select(func.count()).select_from(OddsObservation))}",
            )
            for run in s.scalars(select(ProviderSyncRun).order_by(ProviderSyncRun.id.desc()).limit(3)):
                status = OK if run.status == "succeeded" else WARN
                r.add(
                    status,
                    f"Sync run #{run.id}",
                    f"{run.provider} {run.status} {run.started_at:%Y-%m-%d %H:%M} UTC "
                    f"events={run.events_seen}{' error=' + run.error if run.error else ''}",
                )
        return True
    except Exception as exc:  # report, don't crash
        r.add(FAIL, "PostgreSQL connection", f"{type(exc).__name__}: {str(exc).splitlines()[0][:200]}")
        return False
    finally:
        engine.dispose()


def check_api(api_url: str, r: Report) -> dict[str, Any] | None:
    """Exercise the important endpoints; returns the first fixture (used to verify the frontend)."""
    first_fixture: dict[str, Any] | None = None
    with httpx.Client(base_url=api_url.rstrip("/"), timeout=20) as client:
        endpoints = [
            "/health",
            "/ready",
            "/api/v1/sports",
            "/api/v1/leagues",
            "/api/v1/bookmakers",
            "/api/v1/teams?limit=5",
            "/api/v1/fixtures?limit=5",
            "/api/v1/odds?limit=20",
            "/api/v1/props/players?limit=5",
            "/api/v1/props/teams?limit=5",
            "/api/v1/value-bets?limit=5",
            "/api/v1/odds/movements?limit=5",
            "/api/v1/sync/runs?limit=3",
            "/openapi.json",
        ]
        for path in endpoints:
            try:
                response, ms = _timed(lambda p=path: client.get(p))  # type: ignore[misc]
            except httpx.HTTPError as exc:
                r.add(FAIL, f"API {path}", f"{type(exc).__name__} - is uvicorn running at {api_url}?")
                return None
            body = (
                response.json()
                if response.headers.get("content-type", "").startswith("application/json")
                else None
            )
            detail = f"HTTP {response.status_code} in {ms:.0f} ms"
            if isinstance(body, dict) and "total" in body:
                detail += f", total={body['total']}"
            if isinstance(body, dict) and isinstance(body.get("meta"), dict):
                detail += f", sources={body['meta'].get('sources')}"
            r.add(OK if response.status_code == 200 else FAIL, f"API {path}", detail)
            if path.startswith("/api/v1/fixtures") and isinstance(body, dict) and body.get("items"):
                first_fixture = body["items"][0]

        if first_fixture:
            odds = client.get(f"/api/v1/fixtures/{first_fixture['id']}/odds")
            markets = odds.json().get("markets", []) if odds.status_code == 200 else []
            priced = sum(1 for m in markets for s in m["selections"] if s["prices"])
            r.add(
                OK if odds.status_code == 200 and priced else WARN,
                "API fixture odds",
                f"fixture {first_fixture['id']}: {len(markets)} markets, {priced} priced selections",
            )
    return first_fixture


def check_frontend(frontend_url: str, fixture: dict[str, Any] | None, r: Report) -> None:
    with httpx.Client(base_url=frontend_url.rstrip("/"), timeout=60, follow_redirects=True) as client:
        for path in ["/dashboard", "/value-scanner", "/match-analyzer", "/odds-movement", "/props-lab"]:
            try:
                response, ms = _timed(lambda p=path: client.get(p))  # type: ignore[misc]
            except httpx.HTTPError as exc:
                r.add(
                    FAIL, f"Frontend {path}", f"{type(exc).__name__} - is Next.js running at {frontend_url}?"
                )
                return
            r.add(
                OK if response.status_code == 200 else FAIL,
                f"Frontend {path}",
                f"HTTP {response.status_code} in {ms:.0f} ms",
            )
            if path == "/dashboard" and response.status_code == 200:
                page = response.text
                if fixture is None:
                    r.add(WARN, "Dashboard uses backend", "no backend fixture to look for")
                else:
                    teams = [fixture["home_team"]["name"], fixture["away_team"]["name"]]
                    # Team names alone are not proof (demo backend and mock frontend share fictional teams);
                    # the backend's league naming is unique to API mode.
                    league = fixture["league"]["name"]
                    found = any(html.escape(t) in page for t in teams) and html.escape(league) in page
                    r.add(
                        OK if found else FAIL,
                        "Dashboard uses backend",
                        f"fixture '{teams[0]} v {teams[1]}' {'found' if found else 'NOT found'} on page"
                        + ("" if found else " - set DATA_SOURCE=api in .env.local and restart Next.js"),
                    )
                if "Live odds" in page:
                    r.add(OK, "Dashboard data label", "Live odds (real provider data)")
                elif "Demo data" in page:
                    r.add(OK, "Dashboard data label", "Demo data (synthetic)")


def check_odds_api(settings: Settings, r: Report) -> None:
    """Validates the key with the /sports endpoint, which The Odds API does not count against quota."""
    if settings.odds_api_key is None or not settings.odds_api_key.get_secret_value():
        r.add(WARN, "The Odds API", "skipped - ODDS_API_KEY not set")
        return
    try:
        response = httpx.get(
            f"{settings.odds_api_base_url}/sports",
            params={"apiKey": settings.odds_api_key.get_secret_value()},
            timeout=settings.odds_api_timeout_seconds,
        )
    except httpx.HTTPError as exc:
        r.add(FAIL, "The Odds API", f"unreachable ({type(exc).__name__})")
        return
    remaining = response.headers.get("x-requests-remaining", "?")
    if response.status_code == 200:
        active = sum(1 for s in response.json() if s.get("active"))
        r.add(OK, "The Odds API", f"key valid, {active} active competitions, quota remaining={remaining}")
    elif response.status_code == 401:
        r.add(FAIL, "The Odds API", "key rejected (401) - check ODDS_API_KEY")
    else:
        r.add(FAIL, "The Odds API", f"HTTP {response.status_code}")


def run_doctor(settings: Settings, api_url: str | None, frontend_url: str | None, odds_api: bool) -> int:
    r = Report()
    print("BettingValue doctor\n-------------------")
    check_config(settings, r)
    check_database(settings, r)
    fixture = check_api(api_url, r) if api_url else None
    if frontend_url:
        check_frontend(frontend_url, fixture, r)
    if odds_api:
        check_odds_api(settings, r)
    fails = sum(1 for s, _, _ in r.rows if s == FAIL)
    warns = sum(1 for s, _, _ in r.rows if s == WARN)
    print(f"-------------------\n{len(r.rows)} checks: {fails} failed, {warns} warnings")
    return 1 if r.failed else 0
