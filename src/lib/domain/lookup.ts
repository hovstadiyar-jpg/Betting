import type { Bookmaker, League, Player, Sport, SportId, Team } from "./types";

export interface ReferenceLike {
  sports: Sport[];
  leagues: League[];
  teams: Team[];
  players: Player[];
  bookmakers: Bookmaker[];
}

/** O(1) lookups over reference data; build once per component tree with useMemo. */
export function createLookup(ref: ReferenceLike) {
  const teams = new Map(ref.teams.map((t) => [t.id, t]));
  const players = new Map(ref.players.map((p) => [p.id, p]));
  const leagues = new Map(ref.leagues.map((l) => [l.id, l]));
  const bookmakers = new Map(ref.bookmakers.map((b) => [b.id, b]));
  const sports = new Map(ref.sports.map((s) => [s.id, s]));

  return {
    team: (id: string) => teams.get(id),
    teamName: (id: string) => teams.get(id)?.name ?? id,
    teamShort: (id: string) => teams.get(id)?.shortName ?? id,
    player: (id: string) => players.get(id),
    playerName: (id: string) => players.get(id)?.name ?? id,
    league: (id: string) => leagues.get(id),
    leagueName: (id: string) => leagues.get(id)?.name ?? id,
    bookmakerName: (id: string) => (id === "demo-props" ? "Props book (demo)" : (bookmakers.get(id)?.name ?? id)),
    sportName: (id: SportId) => sports.get(id)?.name ?? id,
  };
}

export type Lookup = ReturnType<typeof createLookup>;
