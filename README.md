# BettingValue

Sports betting analytics platform: bookmaker odds comparison, expected value (EV), player and team props, statistical trends, and a dedicated Props Lab.

> **Status: Phase 2 development preview. Not production-ready.**
> - **Default mode** (`DATA_SOURCE` unset): every number is **synthetic demonstration data**, exactly as in Phase 1.
> - **API mode** (`DATA_SOURCE=api`): odds, fixtures, value bets and line movement come from the FastAPI + PostgreSQL backend in [`backend/`](backend/README.md). That backend is fed by either a synthetic demo provider or The Odds API (with your own key). Player stats, trends, matchups, team form and backtest history remain synthetic, and every dataset is labelled with its source.
> - **Bet365:** BettingValue is not affiliated with Bet365, and the Props Lab does not show Bet365 data.
> - **Out of scope:** there are no accounts, no payments and no betting transactions.

---

## Tech stack

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript 5.9 (strict, `noUncheckedIndexedAccess`) |
| Styling | Tailwind CSS 4 (CSS-first `@theme` tokens, no config file) |
| Icons | lucide-react |
| Charts | Hand-written SVG components (no chart library) |
| Lint | ESLint 9 + `eslint-config-next` |

Runtime dependencies are limited to `next`, `react`, `react-dom` and `lucide-react`. There is no database, Docker, Redis or other background service.

---

## Running locally (Windows)

Requirements: **Node.js 20.9+** (22 LTS recommended) and Git.

```powershell
cd C:\Projects
git clone https://github.com/hovstadiyar-jpg/Betting.git BettingValue
cd BettingValue
git checkout claude/bettingvalue-phase1-frontend-m2aqeu
npm install
npm run dev
```

Open http://localhost:3000. You'll be redirected to `/dashboard`.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with Turbopack (hot reload) |
| `npm run build` | Production build |
| `npm start` | Serve the production build (run `build` first) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint over the project |
| `npm run check` | typecheck, then lint, then build |

### Low-memory tips (8 GB machines)

- **Lighter option for browsing:** run `npm run build` once, then `npm start`. A production server uses much less RAM than the dev server.
- **Dev server use:** keep only one `npm run dev` running and close it when you're done (`Ctrl+C`).
- **Memory cap:** if Node runs out of memory during a build, cap the heap.
  PowerShell: `$env:NODE_OPTIONS="--max-old-space-size=2048"; npm run build`
- **Windows Defender:** excluding `C:\Projects\BettingValue\node_modules` and `.next` from real-time scanning noticeably speeds up installs and builds. Only do this if your security policy allows it.
- **No extra services:** nothing else needs to be running.

---

## Pages

| Route | Page | Highlights |
|---|---|---|
| `/dashboard` | Dashboard | KPI tiles, top value table, EV histogram, sharpest line move, fixtures with best prices, trend cards, odds comparison grid |
| `/value-scanner` | Value Scanner | Filterable and sortable table of every selection priced above model fair odds |
| `/props-lab` | Bet365 Props Lab | Tabs: **Player Props · Team Props · Trend Explorer · Matchup Analysis · Line Movement**. Filters: sport, league, team, player, market, minimum EV, text search |
| `/match-analyzer` | Match Analyzer | Model vs no-vig market probability, every market's odds grid, form comparison, scoring trend, value spots, top props |
| `/players` | Player Intelligence | Player finder, averages, game log vs upcoming line, availability, upcoming props |
| `/teams` | Team Intelligence | League form table, scoring vs conceding trend, home/away splits, fixtures, team props |
| `/odds-movement` | Odds Movement | Shortening, drifting and steam moves with a price-history chart |
| `/backtesting` | Backtesting | Strategy rules (EV floor, odds range, staking), then ROI, drawdown, CLV, equity curve and monthly P/L |
| `/pricing` | Pricing | Illustrative plans and a feature matrix. Billing is disabled |
| `/login`, `/register` | Auth | Validated forms. Nothing is sent or stored |

Global search (press `/`) finds teams, players, matches and leagues.

---

## Architecture

```
src/
├─ app/                         Routes only (thin server components)
│  ├─ (app)/                    Pages inside the sidebar/top-bar shell
│  │  ├─ layout.tsx             Loads search index + feed freshness → AppShell
│  │  └─ dashboard/ value-scanner/ props-lab/ match-analyzer/ players/
│  │     teams/ odds-movement/ backtesting/ pricing/
│  ├─ (auth)/                   Login / register with a split layout
│  ├─ layout.tsx                Root HTML, metadata
│  └─ globals.css               Design tokens (@theme) + base styles
├─ components/                  Reusable presentation components (no data access)
│  ├─ layout/                   AppShell, Sidebar, TopNav, GlobalSearch, Logo, nav-config
│  ├─ ui/                       Card, Badge, Button, Field/Select/Input, Tabs/Segmented,
│  │                            StatTile, PageHeader, DemoDataBanner, EmptyState
│  ├─ data/                     DataTable, MatchTable, ValueTable, OddsComparisonTable,
│  │                            EvIndicator, FreshnessIndicator, TrendCard, HitStrip,
│  │                            MarketFilters
│  └─ charts/                   LineChart, BarChart, Sparkline (SVG, hover + keyboard)
├─ features/                    Page-level interactive compositions ("use client")
│  ├─ props-lab/                PropsLab + one component per tab
│  ├─ value-scanner/ match-analyzer/ players/ teams/ odds-movement/ backtesting/ auth/
└─ lib/
   ├─ api/                      DATA-ACCESS BOUNDARY
   │  ├─ provider.ts            DataProvider interface (the contract)
   │  ├─ mock-provider.ts       Phase 1 implementation (synthetic)
   │  └─ index.ts               `api` – the only thing pages import
   ├─ domain/                   Pure types + logic: odds/EV math, filters, backtest engine, lookups
   ├─ mock/                     Seeded synthetic data generators + fictional reference data
   └─ utils/                    Formatting (UTC-safe), className helper
```

**Rules the code follows:**

1. **Pages fetch, features interact, components present.** Server components in `app/` call `api.*` and pass plain serialisable data to client features. Components never import from `lib/api` or `lib/mock`.
2. **One data contract.** `lib/api/provider.ts` defines every read the UI needs, and every response is wrapped as `Dataset<T> = { meta: { source, asOf, ageSeconds }, data }`. Freshness indicators and "Demo" labels come from `meta`, not from hard-coded text.
3. **Domain logic is pure.** EV, implied probability, no-vig, hit rates, CLV and the backtest engine live in `lib/domain/` with no framework imports, so they can be unit-tested and mirrored in Python later.
4. **Deterministic demo data.** The generators use a fixed seed and a fixed "now" (12 Oct 2026, 12:00 UTC), so server and client renders match and screenshots are reproducible.

### Backend integration (Phase 2)

| Setting (`.env.local`) | Effect |
|---|---|
| `DATA_SOURCE=mock` (default) | Fully synthetic, no backend needed. Data pages are statically prerendered. |
| `DATA_SOURCE=api` | `src/lib/api/http-provider.ts` reads fixtures, markets, value bets, movements and reference data from `API_BASE_URL` (default `http://localhost:8000`), server-side only. Synthetic datasets still come from the mock provider. Data pages render per request. |

- **Composition:** the composite provider lives in `src/lib/api/index.ts`. Pages and components are unchanged apart from source-aware labels (`SourceBadge` / `SourceBanner`).
- **Labelling:** a page shows "Live odds" only when every odds dataset on it comes from a non-demo source.
- **Backend outages:** if the backend is unreachable, the shell still renders, the top bar shows "Odds feed unavailable", and the page shows a retry message (`src/app/(app)/error.tsx`).
- **Backend setup:** see [`backend/README.md`](backend/README.md).

Next steps:
1. Server-side filtering and paging for large real datasets.
2. Real auth behind the existing `/login` and `/register` forms.
3. Generating TS types from the backend's OpenAPI schema.

---

## Design notes

- **Look:** a dark, trading-terminal style built from four surface steps, hairline borders, tabular monospace numerals, and a restrained blue accent. Green and red appear only for EV and profit/loss meaning.
- **Chart colours:** chart series use a categorical palette validated for colour-vision deficiency against the card surface. Charts include legends for multi-series data, hover and keyboard tooltips, and hit targets larger than the marks.
- **Meaning without colour:** status always pairs colour with a sign, label or glyph. Examples include `+4.2%`, `▲` for the best price, and the "Over / Under" badges.
- **Responsive layout:** the sidebar collapses to a drawer below `lg`, low-priority table columns hide on small screens, and wide tables scroll inside their card.

---

## Phase 1 summary

### Completed

- Next.js + TypeScript + Tailwind project scaffolded by hand (no generator boilerplate)
- Responsive app shell: sidebar with grouped navigation, top bar, global search, freshness indicator, mobile drawer
- All 10 required page areas (Dashboard, Value Scanner, Bet365 Props Lab, Match Analyzer, Player Intelligence, Team Intelligence, Odds Movement, Backtesting, Pricing, Login/Register) plus 404 and loading states
- Bet365 Props Lab with all five tabs and the full filter set: sport, league, team, player, market and minimum EV, plus search
- Reusable components: navigation, search, market filters, sortable data tables, match tables, EV indicators, trend cards, odds comparison grid, line/bar/sparkline charts, freshness indicators
- Typed data-access layer with a mock provider, ready to be swapped for an HTTP provider
- Pure domain modules: EV, implied and no-vig probability, overround, hit rate, CLV, backtest engine
- Clear "synthetic data" disclosure on every data page, with a stronger Bet365-specific notice in the Props Lab
- `typecheck`, `lint` and `build` all pass

### Not implemented (by design for Phase 1)

- Real data of any kind: no odds feeds, no bookmaker integrations (including Bet365), no sports statistics provider
- FastAPI backend, PostgreSQL, background jobs and caching
- Authentication, user accounts, saved filters, watchlists and alerts. The bell icon and auth forms are placeholders
- Payments and subscriptions. Pricing is illustrative and the buttons are disabled
- Any betting or real-money transaction functionality, which is out of scope for the product
- Automated tests (unit and E2E), CI pipeline and error monitoring
- Server-side pagination and URL-persisted filters (only Match/Player/Team selection is kept in the URL)
- Light theme and internationalisation (dates are shown in UTC)

## Phase 2 summary

### Completed

- **Assessment:** inspected the project, re-ran the Phase 1 checks (all passing) and audited dependencies (see "Dependency audit" below).
- **Backend:** `backend/` is a FastAPI service with a modular layout (config, db, models, schemas, repositories, services, providers, ingestion, routes, CLI).
- **Endpoints:** health and readiness, sports, leagues, teams, players, bookmakers, fixtures, per-fixture odds, bulk odds, player props, team props, value bets, odds history, odds movements and sync runs. All have Pydantic response models and automatic OpenAPI docs at `/docs`.
- **PostgreSQL schema:** sports, leagues, teams, players, fixtures, bookmakers, markets, selections, odds observations (append-only), current odds, provider sync runs and external ID mappings. Managed with Alembic migrations, CHECK constraints and indexes.
- **Odds integration:** a provider abstraction with a The Odds API adapter (quota tracking, no key leakage in errors) and a deterministic demo provider. Ingestion is idempotent and only appends history when a price changes.
- **Value bets:** a no-vig consensus method, with a staleness cutoff so withdrawn prices are ignored.
- **Frontend wiring:** opt-in HTTP provider, source-aware labels and graceful backend-outage handling.
- **Tests:** 26 backend tests run against real PostgreSQL. They cover the maths, adapter mapping, mocked HTTP, ingestion idempotency, failure auditing and every endpoint.
- **Quality gates:** ruff and mypy `--strict` pass. Frontend typecheck, lint and build pass in both data modes.

### Not done / known gaps

- **Live adapter untested against the real service:** The Odds API adapter has only been tested against a documented-format sample with mocked HTTP. It needs a real API key to verify.
- **No Bet365 data:** no licensed Bet365 source exists in this project, so the Props Lab stays synthetic.
- **Still synthetic in API mode:** player and team statistics, trends, matchups, team form and backtest history (no stats provider yet).
- **Platform features missing:** no authentication, API rate limiting, scheduler process, deployment configuration or monitoring.
- **No frontend tests:** there are no frontend unit or E2E tests. The UI was verified with scripted browser runs.

### Dependency audit

- **Phase 2 update:** `lucide-react` 1.55 → 1.56 (minor).
- **Held back on purpose:** TypeScript 7 (new native compiler, not yet the Next.js default), ESLint 10 (plugin compatibility) and `@types/node` 26 (Node 22 is the target).
- **Open advisory:** `npm audit` reports 5 high-severity findings, all from `braces`, the GHSA-vfj7-8cjw-p6xm DoS via deeply nested glob patterns. It reaches us through `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch`. Since no patched `braces` release exists (3.0.3 is the latest), no safe update can resolve it.
- **Why it wasn't fixed:** `npm audit fix --force` would downgrade `eslint-config-next` to 14.x, so it was not used. The package is dev-only lint tooling that only ever processes this repository's own glob patterns, and it is not part of the built app.
- **Revisit:** when a patched release or an updated `eslint-config-next` ships.

### Known limitations

- The demo dataset is pinned to a fixed date. The "Updated Xs ago" freshness values are synthetic and tick forward from that fixed point.

---

## Responsible use

BettingValue is an analytics and research tool. It does not accept wagers, hold funds or give betting advice. 18+ only.
