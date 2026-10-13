/**
 * HTTP provider: reads odds data from the FastAPI backend (see /backend) and maps it onto the
 * frontend's domain types. Server-side only (uses API_BASE_URL, never exposed to the browser).
 *
 * Covers the datasets the backend actually stores: sports, leagues, teams, players, bookmakers,
 * fixtures, markets/odds, value bets and odds movements. Everything else is supplied by the
 * composite provider in ./index.ts.
 */
import type {
  Bookmaker,
  DashboardSummary,
  Dataset,
  DatasetMeta,
  League,
  LineMovement,
  Market,
  MarketType,
  Match,
  MatchStatus,
  Player,
  Sport,
  Team,
  ValueOpportunity,
} from "@/lib/domain/types";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { noVigProbabilities } from "@/lib/domain/odds";
import type { ReferenceData } from "./provider";

/* ---------------------------------------------------------------- */
/* Backend response shapes (subset of backend/app/schemas/api.py)    */
/* ---------------------------------------------------------------- */

interface ApiMeta {
  sources: string[];
  last_updated: string | null;
  generated_at: string;
}
interface ApiTeamRef {
  id: number;
  name: string;
  short_name: string | null;
}
interface ApiFixture {
  id: number;
  sport_key: string;
  league: { key: string; name: string };
  home_team: ApiTeamRef;
  away_team: ApiTeamRef;
  starts_at: string;
  status: string;
  data_source: string;
}
interface ApiSelection {
  id: number;
  key: string;
  label: string;
  prices: Array<{ bookmaker_key: string; price: number; observed_at: string }>;
  best_price: number | null;
  consensus_probability: number | null;
  model_probability: number | null;
}
interface ApiMarket {
  id: number;
  fixture_id: number;
  market_type: string;
  name: string;
  line: number | null;
  selections: ApiSelection[];
}
interface ApiMarketsPage {
  items: ApiMarket[];
  fixtures: ApiFixture[];
  total: number;
  meta: ApiMeta;
}
interface ApiPage<T> {
  items: T[];
  total: number;
}
interface ApiValueBet {
  fixture: ApiFixture;
  market: { id: number; market_type: string; name: string };
  selection: { id: number; label: string };
  best_price: number;
  bookmaker_key: string;
  fair_probability: number;
  fair_odds: number;
  implied_probability: number;
  ev: number;
  books_used: number;
}
interface ApiMovement {
  fixture: ApiFixture;
  market: { id: number; market_type: string; name: string; line: number | null };
  selection: { id: number; label: string };
  bookmaker_key: string;
  opening_price: number;
  current_price: number;
  implied_shift: number;
  history: Array<{ price: number; observed_at: string }> | null;
}

/* ---------------------------------------------------------------- */
/* Fetch helpers                                                     */
/* ---------------------------------------------------------------- */

export class BackendUnavailableError extends Error {}

const baseUrl = () => (process.env.API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");

async function getJson<T>(path: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<T> {
  const url = new URL(`${baseUrl()}${path}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
  // Odds change constantly: render these routes per request, never at build time.
  await connection();
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  } catch (cause) {
    unstable_rethrow(cause); // let Next.js control-flow errors through
    throw new BackendUnavailableError(`Data service unreachable at ${baseUrl()}`, { cause });
  }
  if (!res.ok) throw new BackendUnavailableError(`Data service returned HTTP ${res.status} for ${url.pathname}`);
  return (await res.json()) as T;
}

/** Follows offset pagination until `total` is reached or `cap` items are collected. */
async function getAllPages<T, P extends { items: T[]; total: number }>(
  path: string,
  params: Record<string, string | number | boolean | undefined>,
  pageSize: number,
  cap: number,
): Promise<{ items: T[]; pages: P[] }> {
  const items: T[] = [];
  const pages: P[] = [];
  for (let offset = 0; offset < cap; offset += pageSize) {
    const page = await getJson<P>(path, { ...params, limit: pageSize, offset });
    pages.push(page);
    items.push(...page.items);
    if (items.length >= page.total || page.items.length === 0) break;
  }
  return { items, pages };
}

/* ---------------------------------------------------------------- */
/* Mapping                                                           */
/* ---------------------------------------------------------------- */

export const ids = {
  team: (id: number) => `t${id}`,
  player: (id: number) => `p${id}`,
  fixture: (id: number) => `f${id}`,
  market: (id: number) => `m${id}`,
  selection: (id: number) => `s${id}`,
};

const MARKET_TYPES: Record<string, MarketType> = {
  match_result: "match-result",
  moneyline: "moneyline",
  total: "total",
  handicap: "handicap",
  btts: "btts",
  player_prop: "player-prop",
  team_prop: "team-prop",
};

function toMeta(meta: Pick<ApiMeta, "sources" | "last_updated">): DatasetMeta {
  const live = meta.sources.length > 0 && meta.sources.every((s) => s !== "demo");
  const asOf = meta.last_updated ?? new Date().toISOString();
  return {
    source: live ? "live" : "synthetic",
    asOf,
    ageSeconds: Math.max(0, Math.round((Date.now() - Date.parse(asOf)) / 1000)),
  };
}

function toStatus(status: string): MatchStatus {
  return status === "live" || status === "finished" ? status : "scheduled";
}

function toMatch(f: ApiFixture): Match {
  return {
    id: ids.fixture(f.id),
    sportId: f.sport_key,
    leagueId: f.league.key,
    homeTeamId: ids.team(f.home_team.id),
    awayTeamId: ids.team(f.away_team.id),
    kickoff: f.starts_at,
    status: toStatus(f.status),
  };
}

function toMarket(m: ApiMarket): Market {
  // Fair probability: the backend's no-vig consensus when enough books price the market,
  // otherwise the no-vig of the best available prices (clearly weaker, but never fabricated).
  const best = m.selections.map((s) => s.best_price ?? 0);
  const fallback = best.every((b) => b > 1) ? noVigProbabilities(best) : m.selections.map(() => 0);
  return {
    id: ids.market(m.id),
    matchId: ids.fixture(m.fixture_id),
    type: MARKET_TYPES[m.market_type] ?? "total",
    name: m.name,
    line: m.line ?? undefined,
    selections: m.selections.map((s, i) => ({
      id: ids.selection(s.id),
      label: s.label,
      quotes: s.prices.map((p) => ({ bookmakerId: p.bookmaker_key, odds: p.price })),
      modelProbability: s.model_probability ?? s.consensus_probability ?? fallback[i] ?? 0,
    })),
  };
}

/* ---------------------------------------------------------------- */
/* Provider                                                          */
/* ---------------------------------------------------------------- */

const MAIN_MARKET_TYPES = ["match_result", "moneyline", "total", "handicap", "btts"];

export const httpProvider = {
  async getReferenceData(): Promise<ReferenceData> {
    const [sports, leagues, teams, players, bookmakers] = await Promise.all([
      getJson<Array<{ key: string; name: string }>>("/api/v1/sports"),
      getJson<Array<{ key: string; name: string; sport_key: string; region: string | null }>>("/api/v1/leagues"),
      getJson<Array<{ id: number; name: string; short_name: string | null; sport_key: string; league_key: string | null }>>(
        "/api/v1/teams",
        { limit: 2000 },
      ),
      getJson<Array<{ id: number; name: string; position: string | null; sport_key: string; team_id: number | null }>>(
        "/api/v1/players",
        { limit: 2000 },
      ),
      getJson<Array<{ key: string; name: string }>>("/api/v1/bookmakers"),
    ]);
    return {
      sports: sports.map<Sport>((s) => ({ id: s.key, name: s.name })),
      leagues: leagues.map<League>((l) => ({ id: l.key, name: l.name, sportId: l.sport_key, region: l.region ?? "" })),
      teams: teams.map<Team>((t) => ({
        id: ids.team(t.id),
        name: t.name,
        shortName: t.short_name ?? t.name.slice(0, 3).toUpperCase(),
        leagueId: t.league_key ?? "",
        sportId: t.sport_key,
        rating: 0,
      })),
      players: players.map<Player>((p) => ({
        id: ids.player(p.id),
        name: p.name,
        teamId: p.team_id !== null ? ids.team(p.team_id) : "",
        sportId: p.sport_key,
        position: p.position ?? "",
      })),
      bookmakers: bookmakers.map<Bookmaker>((b) => ({ id: b.key, name: b.name })),
    };
  },

  async getMatches(): Promise<Dataset<Match[]>> {
    const [{ items }, runs] = await Promise.all([
      getAllPages<ApiFixture, ApiPage<ApiFixture>>("/api/v1/fixtures", {}, 200, 2000),
      getJson<Array<{ status: string; finished_at: string | null }>>("/api/v1/sync/runs", { limit: 20 }),
    ]);
    const sources = [...new Set(items.map((f) => f.data_source))];
    // Feed freshness = the last successful provider sync.
    const lastSync = runs.find((r) => r.status === "succeeded")?.finished_at ?? null;
    return { meta: toMeta({ sources, last_updated: lastSync }), data: items.map(toMatch) };
  },

  async getMarkets(matchId?: string): Promise<Dataset<Market[]>> {
    if (matchId?.startsWith("f")) {
      const body = await getJson<{ markets: ApiMarket[]; meta: ApiMeta }>(`/api/v1/fixtures/${matchId.slice(1)}/odds`);
      return { meta: toMeta(body.meta), data: body.markets.map(toMarket) };
    }
    const params = new URLSearchParams();
    MAIN_MARKET_TYPES.forEach((t) => params.append("market_type", t));
    const { items, pages } = await getAllPages<ApiMarket, ApiMarketsPage>(`/api/v1/odds?${params}`, {}, 500, 5000);
    const sources = [...new Set(pages.flatMap((p) => p.meta.sources))];
    const lastUpdated = pages.map((p) => p.meta.last_updated).filter((t): t is string => !!t).sort().at(-1) ?? null;
    return { meta: toMeta({ sources, last_updated: lastUpdated }), data: items.map(toMarket) };
  },

  async getValueOpportunities(): Promise<Dataset<ValueOpportunity[]>> {
    const body = await getJson<{ items: ApiValueBet[]; meta: ApiMeta }>("/api/v1/value-bets", { min_ev: 0.005, limit: 500 });
    return {
      meta: toMeta(body.meta),
      data: body.items.map((v) => ({
        id: `v${v.selection.id}`,
        matchId: ids.fixture(v.fixture.id),
        marketId: ids.market(v.market.id),
        marketType: MARKET_TYPES[v.market.market_type] ?? "total",
        marketName: v.market.name,
        selectionLabel: v.selection.label,
        bestOdds: v.best_price,
        bestBookmakerId: v.bookmaker_key,
        fairOdds: v.fair_odds,
        modelProbability: v.fair_probability,
        impliedProbability: v.implied_probability,
        ev: v.ev,
        // No model confidence exists yet: report coverage (share of 8+ books agreeing on the fair price).
        confidence: Math.min(1, v.books_used / 8),
      })),
    };
  },

  async getLineMovements(): Promise<Dataset<LineMovement[]>> {
    const body = await getJson<{ items: ApiMovement[]; meta: ApiMeta }>("/api/v1/odds/movements", {
      hours: 48,
      limit: 200,
      include_history: true,
    });
    return {
      meta: toMeta(body.meta),
      data: body.items.map((m) => {
        const type = MARKET_TYPES[m.market.market_type];
        return {
          id: `lm-${m.selection.id}-${m.bookmaker_key}`,
          category: type === "player-prop" ? "player-prop" : type === "team-prop" ? "team-prop" : "match",
          matchId: ids.fixture(m.fixture.id),
          sportId: m.fixture.sport_key,
          leagueId: m.fixture.league.key,
          marketName: m.market.name,
          selectionLabel: m.selection.label,
          bookmakerId: m.bookmaker_key,
          openingOdds: m.opening_price,
          currentOdds: m.current_price,
          history: (m.history ?? []).map((p) => ({ t: p.observed_at, odds: p.price })),
          impliedShift: m.implied_shift,
          // Heuristic flag for a large move; the backend does not classify steam itself.
          steam: Math.abs(m.implied_shift) >= 0.07,
        };
      }),
    };
  },

  async getDashboardSummary(): Promise<Dataset<DashboardSummary>> {
    const [value, fixtures, books, playerProps, teamProps] = await Promise.all([
      httpProvider.getValueOpportunities(),
      getJson<ApiPage<ApiFixture>>("/api/v1/fixtures", { limit: 1 }),
      getJson<unknown[]>("/api/v1/bookmakers"),
      getJson<ApiMarketsPage>("/api/v1/props/players", { limit: 1 }),
      getJson<ApiMarketsPage>("/api/v1/props/teams", { limit: 1 }),
    ]);
    const evs = value.data.map((v) => v.ev);
    return {
      meta: value.meta,
      data: {
        valueBetsCount: evs.length,
        averageEv: evs.length ? evs.reduce((a, b) => a + b, 0) / evs.length : 0,
        topEv: evs.length ? Math.max(...evs) : 0,
        matchesTracked: fixtures.total,
        bookmakersTracked: books.length,
        propsTracked: playerProps.total + teamProps.total,
      },
    };
  },
};
