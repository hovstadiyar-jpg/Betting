import type { Dataset, DatasetMeta, SearchEntry } from "@/lib/domain/types";
import { DEMO_ANCHOR_ISO, getDemoDatabase } from "@/lib/mock/generate";
import type { DataProvider } from "./provider";

/** Synthetic freshness per dataset type, so the UI can demonstrate freshness states. */
const AGE_SECONDS = {
  odds: 18,
  props: 42,
  movement: 95,
  form: 3_600,
  history: 86_400,
  summary: 25,
} as const;

function wrap<T>(data: T, age: keyof typeof AGE_SECONDS): Dataset<T> {
  const meta: DatasetMeta = { source: "synthetic", asOf: DEMO_ANCHOR_ISO, ageSeconds: AGE_SECONDS[age] };
  return { meta, data };
}

export const mockProvider: DataProvider = {
  async getReferenceData() {
    const { sports, leagues, teams, players, bookmakers } = getDemoDatabase().reference;
    return { sports, leagues, teams, players, bookmakers };
  },

  async getSearchIndex() {
    const db = getDemoDatabase();
    const { leagues, teams, players } = db.reference;
    const teamById = new Map(teams.map((t) => [t.id, t]));
    const leagueById = new Map(leagues.map((l) => [l.id, l]));

    const entries: SearchEntry[] = [
      ...leagues.map((l) => ({
        id: l.id,
        kind: "league" as const,
        label: l.name,
        sublabel: l.region,
        href: `/value-scanner?league=${l.id}`,
      })),
      ...teams.map((t) => ({
        id: t.id,
        kind: "team" as const,
        label: t.name,
        sublabel: leagueById.get(t.leagueId)?.name ?? "",
        href: `/teams?team=${t.id}`,
      })),
      ...players.map((p) => ({
        id: p.id,
        kind: "player" as const,
        label: p.name,
        sublabel: `${p.position} · ${teamById.get(p.teamId)?.name ?? ""}`,
        href: `/players?player=${p.id}`,
      })),
      ...db.matches.map((m) => ({
        id: m.id,
        kind: "match" as const,
        label: `${teamById.get(m.homeTeamId)?.name} v ${teamById.get(m.awayTeamId)?.name}`,
        sublabel: leagueById.get(m.leagueId)?.name ?? "",
        href: `/match-analyzer?match=${m.id}`,
      })),
    ];
    return entries;
  },

  async getDashboardSummary() {
    const db = getDemoDatabase();
    const vos = db.valueOpportunities;
    const evs = vos.map((v) => v.ev);
    return wrap(
      {
        valueBetsCount: vos.length,
        averageEv: evs.length ? evs.reduce((a, b) => a + b, 0) / evs.length : 0,
        topEv: evs.length ? Math.max(...evs) : 0,
        matchesTracked: db.matches.length,
        bookmakersTracked: db.reference.bookmakers.length,
        propsTracked: db.playerProps.length + db.teamProps.length,
        modelBrierScore: 0.211,
        opportunitiesTrend: [14, 17, 15, 19, 22, 21, 18, 24, 27, 25, 29, 31, 28, 30, 34, 33, 29, 35, 38, 36, 40, 37, 41, vos.length],
      },
      "summary",
    );
  },

  async getMatches() {
    return wrap(getDemoDatabase().matches, "odds");
  },

  async getMarkets(matchId) {
    const markets = getDemoDatabase().markets;
    return wrap(matchId ? markets.filter((m) => m.matchId === matchId) : markets, "odds");
  },

  async getValueOpportunities() {
    return wrap(getDemoDatabase().valueOpportunities, "odds");
  },

  async getPlayerProps() {
    return wrap(getDemoDatabase().playerProps, "props");
  },

  async getTeamProps() {
    return wrap(getDemoDatabase().teamProps, "props");
  },

  async getTrends() {
    return wrap(getDemoDatabase().trends, "props");
  },

  async getMatchups() {
    return wrap(getDemoDatabase().matchups, "props");
  },

  async getLineMovements() {
    return wrap(getDemoDatabase().lineMovements, "movement");
  },

  async getTeamForms() {
    return wrap(getDemoDatabase().teamForms, "form");
  },

  async getPlayerProfiles() {
    return wrap(getDemoDatabase().playerProfiles, "form");
  },

  async getHistoricalBets() {
    return wrap(getDemoDatabase().historicalBets, "history");
  },
};
