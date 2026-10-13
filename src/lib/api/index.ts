// Server-side only: import from Server Components / route handlers, never from "use client" files.

import type { SearchEntry } from "@/lib/domain/types";
import { httpProvider } from "./http-provider";
import { mockProvider } from "./mock-provider";
import type { DataProvider, ReferenceData } from "./provider";

/**
 * Single entry point for data access from server components.
 *
 * DATA_SOURCE=mock (default): everything comes from the synthetic generator (Phase 1 behaviour).
 * DATA_SOURCE=api: odds datasets come from the FastAPI backend (API_BASE_URL). Datasets the backend
 * does not provide yet (player stats, trends, matchups, team form, backtest history) stay synthetic.
 * Every dataset carries meta.source, so the UI labels each one correctly.
 */
function createCompositeProvider(): DataProvider {
  const mergedReference = async (): Promise<ReferenceData> => {
    const [live, demo] = await Promise.all([httpProvider.getReferenceData(), mockProvider.getReferenceData()]);
    return {
      sports: [...live.sports, ...demo.sports.filter((s) => !live.sports.some((l) => l.id === s.id))],
      // Synthetic stats leagues are tagged so they are never mistaken for real competitions.
      leagues: [...live.leagues, ...demo.leagues.map((l) => ({ ...l, name: `${l.name} (demo stats)` }))],
      teams: [...live.teams, ...demo.teams],
      players: [...live.players, ...demo.players],
      bookmakers: [...live.bookmakers, ...demo.bookmakers],
    };
  };

  return {
    ...mockProvider,
    getReferenceData: mergedReference,
    getMatches: httpProvider.getMatches,
    getMarkets: httpProvider.getMarkets,
    getValueOpportunities: httpProvider.getValueOpportunities,
    getLineMovements: httpProvider.getLineMovements,
    getDashboardSummary: httpProvider.getDashboardSummary,

    async getSearchIndex() {
      const [ref, matches, demoIndex] = await Promise.all([
        httpProvider.getReferenceData(),
        httpProvider.getMatches(),
        mockProvider.getSearchIndex(),
      ]);
      const teamName = new Map(ref.teams.map((t) => [t.id, t.name]));
      const leagueName = new Map(ref.leagues.map((l) => [l.id, l.name]));
      // Backend teams link to their next fixture: team pages are still driven by demo stats.
      const nextFixture = new Map<string, string>();
      for (const m of matches.data) {
        if (!nextFixture.has(m.homeTeamId)) nextFixture.set(m.homeTeamId, m.id);
        if (!nextFixture.has(m.awayTeamId)) nextFixture.set(m.awayTeamId, m.id);
      }
      const live: SearchEntry[] = [
        ...ref.leagues.map((l) => ({
          id: l.id,
          kind: "league" as const,
          label: l.name,
          sublabel: l.region || "League",
          href: `/value-scanner?league=${encodeURIComponent(l.id)}`,
        })),
        ...ref.teams
          .filter((t) => nextFixture.has(t.id))
          .map((t) => ({
            id: t.id,
            kind: "team" as const,
            label: t.name,
            sublabel: `Next fixture · ${leagueName.get(t.leagueId) ?? ""}`,
            href: `/match-analyzer?match=${nextFixture.get(t.id)}`,
          })),
        ...matches.data.map((m) => ({
          id: m.id,
          kind: "match" as const,
          label: `${teamName.get(m.homeTeamId) ?? "?"} v ${teamName.get(m.awayTeamId) ?? "?"}`,
          sublabel: leagueName.get(m.leagueId) ?? "",
          href: `/match-analyzer?match=${m.id}`,
        })),
      ];
      // Keep demo players/teams searchable for the stats pages, labelled as demo.
      const demo = demoIndex
        .filter((e) => e.kind === "player" || e.kind === "team")
        .map((e) => ({ ...e, sublabel: `${e.sublabel} · demo stats` }));
      return [...live, ...demo];
    },
  };
}

export const dataSource = process.env.DATA_SOURCE === "api" ? "api" : "mock";

export const api: DataProvider = dataSource === "api" ? createCompositeProvider() : mockProvider;

export type { DataProvider, ReferenceData } from "./provider";
