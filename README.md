# BettingValue

Sports betting analytics platform: bookmaker odds comparison, expected value (EV), player and team props, statistical trends, and a dedicated Props Lab.

> **Status: Phase 1 frontend preview. Not production-ready.**
> Every number in the app is **synthetic demonstration data** produced by a seeded random generator. No bookmaker, odds provider or sports-data feed is connected. That includes Bet365: BettingValue is not affiliated with Bet365, and the Props Lab does not show Bet365 data. There are no accounts, no payments and no betting transactions.

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

### Planned FastAPI / PostgreSQL integration (not implemented)

1. Build a FastAPI service whose response models mirror `src/lib/domain/types.ts` (consider generating the TS types from its OpenAPI schema).
2. Add `src/lib/api/http-provider.ts` that implements `DataProvider` with `fetch(`${API_BASE_URL}/…`)`, plus Next.js caching / revalidation per dataset.
3. Switch `src/lib/api/index.ts` on an env var (`DATA_SOURCE=mock|api`). No page or component changes should be needed.
4. Move filtering and paging server-side for large datasets. Phase 1 filters in the browser, which is fine for a few hundred rows. The Props Lab page is around 110 KB gzipped today.
5. Add real auth (e.g. Auth.js or the FastAPI service) behind the existing `/login` and `/register` forms.

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

### Known limitations

- The demo dataset is pinned to a fixed date. The "Updated Xs ago" freshness values are synthetic and tick forward from that fixed point.
- `npm audit` reports high-severity advisories in `braces`/`micromatch`. They come from the lint toolchain (`eslint-config-next`), are dev-only and are not part of the shipped app. The suggested "fix" downgrades to Next 14 tooling, so it was not applied.

---

## Responsible use

BettingValue is an analytics and research tool. It does not accept wagers, hold funds or give betting advice. 18+ only.
