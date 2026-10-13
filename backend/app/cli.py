"""Command-line entry points: ``python -m app.cli <command>``.

Synchronisation is deliberately CLI-only (run it by hand, from cron, or from Windows Task Scheduler)
so the HTTP API exposes no unauthenticated write operations.
"""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.session import get_sessionmaker
from app.ingestion.sync import run_sync
from app.models import ProviderSyncRun
from app.providers.base import ProviderError
from app.providers.demo import LEAGUES as DEMO_LEAGUES
from app.providers.demo import DemoProvider
from app.providers.the_odds_api import TheOddsApiProvider


def _odds_api(prop_markets: str = "", max_prop_events: int = 0) -> TheOddsApiProvider:
    s = get_settings()
    if s.odds_api_key is None or not s.odds_api_key.get_secret_value():
        raise ProviderError("ODDS_API_KEY is not set. Add it to backend/.env (see .env.example).")
    return TheOddsApiProvider(
        api_key=s.odds_api_key.get_secret_value(),
        base_url=s.odds_api_base_url,
        regions=s.odds_api_regions,
        markets=s.odds_api_markets,
        prop_markets=prop_markets,
        max_prop_events=max_prop_events,
        timeout=s.odds_api_timeout_seconds,
    )


def cmd_sync_demo(args: argparse.Namespace) -> int:
    factory = get_sessionmaker()
    now = datetime.now(UTC)
    # Optionally backfill history: replay the demo feed at 30-minute steps up to now.
    steps = max(0, int(args.history_hours * 2))
    for i in range(steps, -1, -1):
        run = run_sync(factory, DemoProvider(as_of=now - timedelta(minutes=30 * i)), args.leagues)
        if i == 0 or i % 8 == 0:
            print(
                f"[demo] {run.started_at:%H:%M:%S} events={run.events_seen} "
                f"new_observations={run.observations_inserted}"
            )
    return 0


def cmd_sync(args: argparse.Namespace) -> int:
    provider = _odds_api(args.prop_markets, args.max_prop_events)
    run = run_sync(get_sessionmaker(), provider, args.leagues)
    print(
        f"[the-odds-api] status={run.status} events={run.events_seen} markets={run.markets_upserted} "
        f"new_observations={run.observations_inserted} quota_used={run.requests_used} "
        f"quota_remaining={run.requests_remaining}"
    )
    return 0


def cmd_list_competitions(_: argparse.Namespace) -> int:
    for c in _odds_api().list_competitions():
        if c.get("active") and not c.get("has_outrights"):
            print(f"{c.get('key'):<40} {c.get('group'):<20} {c.get('title')}")
    return 0


def cmd_runs(args: argparse.Namespace) -> int:
    with get_sessionmaker()() as s:
        rows = s.scalars(select(ProviderSyncRun).order_by(ProviderSyncRun.id.desc()).limit(args.limit)).all()
    for r in rows:
        print(
            f"#{r.id:<5} {r.provider:<14} {r.status:<10} {r.started_at:%Y-%m-%d %H:%M} "
            f"events={r.events_seen} obs={r.observations_inserted} {r.error or ''}"
        )
    return 0


def main(argv: list[str] | None = None) -> int:
    configure_logging(logging.WARNING)
    parser = argparse.ArgumentParser(prog="python -m app.cli", description="BettingValue backend tasks")
    sub = parser.add_subparsers(dest="command", required=True)

    demo = sub.add_parser("sync-demo", help="Load synthetic demo fixtures and odds (no API key needed)")
    demo.add_argument(
        "--leagues", nargs="*", default=None, choices=list(DEMO_LEAGUES), help="Demo leagues (default all)"
    )
    demo.add_argument(
        "--history-hours", type=float, default=0, help="Backfill N hours of price history first"
    )
    demo.set_defaults(func=cmd_sync_demo)

    live = sub.add_parser("sync", help="Fetch real odds from The Odds API (requires ODDS_API_KEY)")
    live.add_argument(
        "--leagues", nargs="+", required=True, help="Competition keys, e.g. soccer_epl basketball_nba"
    )
    live.add_argument(
        "--prop-markets", default="", help="Comma-separated prop markets, e.g. player_points (costs quota)"
    )
    live.add_argument("--max-prop-events", type=int, default=0, help="Events per league to request props for")
    live.set_defaults(func=cmd_sync)

    comps = sub.add_parser(
        "list-competitions", help="List competitions available from The Odds API (free call)"
    )
    comps.set_defaults(func=cmd_list_competitions)

    runs = sub.add_parser("runs", help="Show recent provider sync runs")
    runs.add_argument("--limit", type=int, default=15)
    runs.set_defaults(func=cmd_runs)

    args = parser.parse_args(argv)
    try:
        return int(args.func(args))
    except ProviderError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
