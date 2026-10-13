# BettingValue backend (Phase 2)

FastAPI + PostgreSQL service that ingests bookmaker odds, stores their history and serves fixtures, odds, props, value-bet calculations and price movements to the Next.js frontend.

> **Status: development preview, not production-ready.** The API is read-only and has no authentication (it only exposes public market data). Data comes from either the **demo provider** (synthetic, labelled `demo`) or **The Odds API** (a licensed aggregator; needs your own API key). Bet365 data is **not** integrated. See "Data sources" below.

## Stack

| Concern | Choice |
|---|---|
| API | FastAPI 0.143, Pydantic v2 (validation + OpenAPI) |
| Database | PostgreSQL 15+ (uses `UNIQUE NULLS NOT DISTINCT`), SQLAlchemy 2.1, Alembic |
| Driver | psycopg 3 |
| HTTP client | httpx (provider adapter) |
| Tooling | uv, pytest, ruff, mypy (`--strict`) |

## Layout

```
backend/
├─ app/
│  ├─ main.py               App factory, CORS, router registration
│  ├─ cli.py                sync-demo | sync | list-competitions | runs
│  ├─ core/                 Settings (env / .env), logging
│  ├─ db/                   Declarative base (naming conventions), engine/session
│  ├─ models/               ORM tables (see schema below)
│  ├─ schemas/api.py        Pydantic response models = public API contract
│  ├─ repositories/odds.py  Read-side SQL queries
│  ├─ services/             Odds maths, value detection, response assembly
│  ├─ providers/            Provider-neutral DTOs + adapters (the_odds_api, demo)
│  ├─ ingestion/sync.py     Idempotent upserts, append-only history, sync audit
│  └─ api/routes/           health, reference, fixtures, odds, props, value, sync
├─ alembic/                 Migrations (0001 initial schema, 0002 current prices)
└─ tests/                   pytest suite (runs against a real PostgreSQL test DB)
```

## Database schema

| Table | Purpose |
|---|---|
| `sports` | Sport catalogue (`football`, `basketball`, `ice-hockey`, ...) |
| `leagues` | Competitions; `key` is the provider's competition key (e.g. `soccer_epl`) |
| `teams` | Unique per sport by name; optional primary league |
| `players` | Prop subjects; linked to a team when the provider supplies it |
| `fixtures` | Events with kickoff, status and `data_source` (`demo` / `the-odds-api`) |
| `bookmakers` | Bookmaker catalogue (provider bookmaker keys) |
| `markets` | One row per fixture/type/line/subject (`UNIQUE NULLS NOT DISTINCT`), incl. player/team props |
| `selections` | Outcomes of a market (`home`, `draw`, `over`, ...), optional `model_probability` |
| `odds_observations` | **Append-only price history**; a row is written only when a bookmaker's price changes |
| `odds_current` | Latest price per selection x bookmaker with `price_since` and `last_seen_at` (staleness) |
| `provider_sync_runs` | Audit of every sync: status, counts, quota usage, sanitised error |
| `external_refs` | Maps provider IDs to internal rows so several providers can feed one model |

Key decisions:
- **Prices are decimal odds** stored as `NUMERIC(8,3)`. No floats in the database.
- **History stays compact.** Observations are written on change only. `odds_current.last_seen_at` shows whether a price is still offered. Prices not re-confirmed within `ODDS_STALE_AFTER_MINUTES` are excluded from best-price and value calculations.
- **CHECK constraints** cover enums, `price > 1`, distinct home/away teams and prop subjects.
- **Concurrent syncs** of the same provider are serialised with a PostgreSQL advisory lock.

## API

Interactive docs: `http://localhost:8000/docs` (Swagger) and `/redoc`. The schema is at `/openapi.json`.

| Method & path | Description |
|---|---|
| `GET /health` | Liveness (no DB access) |
| `GET /ready` | Readiness: DB reachable, schema version, latest sync (503 if DB down) |
| `GET /api/v1/sports` · `/leagues` · `/teams` · `/players` · `/bookmakers` | Reference data |
| `GET /api/v1/fixtures` | Upcoming fixtures. Filters: `sport`, `league`, `team_id`, `status`, `from`, `to`, `upcoming`, pagination |
| `GET /api/v1/fixtures/{id}` | One fixture |
| `GET /api/v1/fixtures/{id}/odds` | All markets with every bookmaker's current price, best price and no-vig consensus (`include_props`, `market_type`) |
| `GET /api/v1/odds` | Current odds for upcoming fixtures, paginated |
| `GET /api/v1/props/players` · `/props/teams` | Prop markets. Filters: `sport`, `league`, `fixture_id`, `player_id`, `team_id`, `stat` |
| `GET /api/v1/value-bets` | Selections priced above fair value. `method=consensus` (default) or `model`, plus `min_ev` and `min_books` |
| `GET /api/v1/odds/history/{selection_id}` | Historical observations per bookmaker (`bookmaker`, `hours`) |
| `GET /api/v1/odds/movements` | Largest opening→current moves in a window (`hours`, `include_history`) |
| `GET /api/v1/sync/runs` | Provider sync audit log |

Every odds response includes `meta.sources`. A value of `demo` means synthetic data.

### How value is calculated

`EV = fair_probability × best_price − 1`.

**Consensus method (default).** For every bookmaker that prices *all* selections of a market, the margin is removed proportionally. The resulting probabilities are averaged across those bookmakers, and at least `VALUE_MIN_BOOKS` (default 3) must contribute. This uses only market data, so it is meaningful with real odds. Keep in mind:
- **What it finds:** prices that beat the market consensus.
- **What it doesn't prove:** an edge on the true outcome.
- **Known limits:** it is sensitive to stale or erroneous prices (mitigated by the staleness cutoff) and to correlated bookmakers.

**Model method.** Uses `selections.model_probability`. No model exists yet, so this returns nothing until one writes probabilities.

## Data sources

| Provider | Command | Notes |
|---|---|---|
| **Demo** (`demo`) | `python -m app.cli sync-demo [--history-hours 6]` | Fictional leagues, teams, players and "Demo Book A–F". Deterministic prices that drift over time, so repeated syncs build history. No key needed. |
| **The Odds API** (`the-odds-api`) | `python -m app.cli sync --leagues soccer_epl basketball_nba` | Real bookmaker odds. Needs `ODDS_API_KEY` from the-odds-api.com (has a free tier). Each call costs *markets × regions* credits, and quota is recorded per run. List competitions with `python -m app.cli list-competitions` (free call). Props: `--prop-markets player_points --max-prop-events 3` (one extra call per event). |

**Bet365.** Bet365 does not offer a public odds API, and scraping its site would breach its terms of use. The Props Lab therefore stays on synthetic data. A Bet365 integration needs a licensed feed that includes Bet365; which providers carry it has not been verified. Whether The Odds API returns Bet365 depends on its current bookmaker coverage for your regions, so check its bookmaker list. The adapter only stores the bookmakers the provider actually returns.

The live adapter is tested against a hand-written payload in the documented v4 format (`tests/fixtures/the_odds_api_sample.json`) with mocked HTTP. **It has not been run against the live service in this environment (no API key).** Run a small sync with your key and check `python -m app.cli runs` before relying on it.

## Windows: scripted setup (recommended)

Run these from the repository root (`C:\Projects\BettingValue`) in PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\setup.ps1   # once, and after pulling changes
powershell -ExecutionPolicy Bypass -File scripts\windows\start.ps1   # starts API + web, verifies, opens the dashboard
powershell -ExecutionPolicy Bypass -File scripts\windows\stop.ps1    # stops whatever listens on ports 8000/3000
```

What `setup.ps1` does:

| Step | Details |
|---|---|
| Tools | Installs missing tools with winget: Python 3.13, uv, Node.js LTS (`-SkipInstall` to skip). |
| Config | Prompts, with hidden input, for the PostgreSQL/Neon connection string and an optional The Odds API key. You can also pass them as `$env:BV_DATABASE_URL` / `$env:BV_ODDS_API_KEY`. |
| `.env` safety | Only adds missing keys to `backend\.env` and `.env.local`. Existing values, such as API-Football keys, are kept. A single changed line (`DATA_SOURCE`) is backed up first to `*.bak-<timestamp>`. Refuses to continue if either file is not Git-ignored. |
| Git | Read-only: it reports the branch, stash count and uncommitted changes, but never checks out, stashes or resets anything. If Phase 2 is missing from the checkout, it suggests a separate `git worktree` instead of switching branches. |
| Database | `alembic upgrade head` only (non-destructive). |
| Data | Real odds via `sync --leagues soccer_epl` when an API key is set, otherwise synthetic demo odds. |
| Frontend | `npm ci` if needed, then `npm run build`. |

`start.ps1` opens each server in its own window, waits for both, then runs the doctor.

### Health check (`doctor`)

```powershell
cd backend
uv run python -m app.cli doctor --odds-api        # add --no-api / --no-frontend before servers run
```

It checks, without ever printing passwords or keys:
- configuration and PostgreSQL version (15+);
- migration status;
- stored fixtures split into real and synthetic;
- recent sync runs and every important API endpoint;
- that the dashboard renders a backend fixture (team and league names), so it is really reading the API;
- that The Odds API key is valid, using the free `/sports` call.

It exits non-zero when any check fails.

> **Important:** `DATA_SOURCE` is applied when the Next.js app is **built**. In mock mode the data pages are prerendered statically, so a build made with `DATA_SOURCE=mock` keeps serving demo pages even if you later start it with `api`. After changing `.env.local`, run `npm run build` again (setup.ps1 does this). `npm run dev` always reads the current value.

## Running locally on Windows (manual steps)

Requirements:
- **Python:** 3.11+ (3.12 or 3.13 recommended).
- **uv:** `powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"`
- **PostgreSQL:** 15 or newer. Two options:

**Option A (local, about 100–200 MB RAM idle).** Install PostgreSQL 16 or 17 from the EDB Windows installer. To save memory on an 8 GB laptop, set the `postgresql-x64-16` service to *Manual* in `services.msc` and start it only when needed.

```powershell
psql -U postgres -c "CREATE ROLE bettingvalue LOGIN PASSWORD 'bettingvalue';"
psql -U postgres -c "CREATE DATABASE bettingvalue OWNER bettingvalue;"
psql -U postgres -c "CREATE DATABASE bettingvalue_test OWNER bettingvalue;"   # only for running tests
```

**Option B (no local service).** Use a hosted PostgreSQL (for example Neon or Supabase free tiers) and paste its connection string into `DATABASE_URL` as given (`postgresql://…?sslmode=require` is accepted and switched to the psycopg driver automatically).

Then:

```powershell
cd C:\Projects\BettingValue\backend
copy .env.example .env          # edit DATABASE_URL / ODDS_API_KEY
uv sync                         # creates .venv with pinned dependencies (uv.lock)
uv run alembic upgrade head     # create the schema
uv run python -m app.cli sync-demo --history-hours 6   # demo data with price history
uv run uvicorn app.main:app --reload --port 8000       # http://localhost:8000/docs
```

Connect the frontend by creating a `.env.local` in the project root:

```
DATA_SOURCE=api
API_BASE_URL=http://localhost:8000
```

Then `npm run dev`. Unset `DATA_SOURCE` (or set `mock`) to return to the fully synthetic Phase 1 behaviour.

### Keeping odds fresh

Sync is CLI-only, so the API stays read-only. To run it on a schedule, use Windows Task Scheduler: a task that runs
`C:\Projects\BettingValue\backend\.venv\Scripts\python.exe -m app.cli sync --leagues soccer_epl` every 15–30 minutes, with "Start in" set to the `backend` folder. Size the interval to your API quota.

## Checks

```powershell
uv run ruff check . ; uv run ruff format --check . ; uv run mypy app
$env:TEST_DATABASE_URL="postgresql+psycopg://bettingvalue:bettingvalue@localhost:5432/bettingvalue_test"; uv run pytest
```

Tests run every Alembic migration down and up, then **truncate all tables** in the test database. Never point `TEST_DATABASE_URL` at a database you care about.

## Not done yet

- **No authentication, rate limiting or API keys for clients.** Needed before any public deployment.
- **No scheduler or worker process.** Use cron or Task Scheduler with the CLI.
- **No statistics provider.** Player and team stats, trends, matchups, form and backtest history in the frontend remain synthetic.
- **No pricing model.** `model_probability` is never populated, so the value calculation uses market consensus only.
- **No production deployment configuration.** That covers process manager, TLS, backups, monitoring and connection pooling (e.g. PgBouncer).
- **Ingestion is row-by-row.** It handles about 45 fixtures in 1–2 s. Larger volumes will need batched upserts.
