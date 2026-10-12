import type { SportId } from "./types";

/**
 * Shared filter state used by the scanner, Props Lab and other explorers.
 * Kept serialisable so it can later map 1:1 onto API query parameters.
 */
export interface MarketFilterState {
  sportId: SportId | "all";
  leagueId: string | "all";
  teamId: string | "all";
  playerId: string | "all";
  market: string | "all";
  minEv: number;
  query: string;
}

export const DEFAULT_FILTERS: MarketFilterState = {
  sportId: "all",
  leagueId: "all",
  teamId: "all",
  playerId: "all",
  market: "all",
  /** -1 = no EV floor ("Any"). */
  minEv: -1,
  query: "",
};

interface Filterable {
  sportId: SportId;
  leagueId: string;
  teamId?: string;
  opponentId?: string;
  playerId?: string;
  market?: string;
  ev?: number;
}

export function matchesFilters(item: Filterable, f: MarketFilterState): boolean {
  if (f.sportId !== "all" && item.sportId !== f.sportId) return false;
  if (f.leagueId !== "all" && item.leagueId !== f.leagueId) return false;
  if (f.teamId !== "all" && item.teamId !== f.teamId && item.opponentId !== f.teamId) return false;
  if (f.playerId !== "all" && item.playerId !== undefined && item.playerId !== f.playerId) return false;
  if (f.market !== "all" && item.market !== undefined && item.market !== f.market) return false;
  if (item.ev !== undefined && item.ev < f.minEv) return false;
  return true;
}
