/**
 * Fictional reference data for Phase 1.
 *
 * Every league, team, player and bookmaker here is invented. Names are
 * deliberately fictional so the demo cannot be mistaken for real market data.
 */
import type { Bookmaker, League, Player, Sport, SportId, Team } from "@/lib/domain/types";
import { createRng, pick, type Rng, uniform } from "./random";

export const SPORTS: Sport[] = [
  { id: "football", name: "Football" },
  { id: "basketball", name: "Basketball" },
  { id: "ice-hockey", name: "Ice Hockey" },
];

export const LEAGUES: League[] = [
  { id: "pd", name: "Premier Division", sportId: "football", region: "Demo North" },
  { id: "lp", name: "Liga Primera", sportId: "football", region: "Demo South" },
  { id: "pbl", name: "Pro Basketball League", sportId: "basketball", region: "Demo West" },
  { id: "ehl", name: "Elite Hockey League", sportId: "ice-hockey", region: "Demo East" },
];

/** Generic placeholder bookmakers — not real operators. */
export const BOOKMAKERS: Bookmaker[] = [
  { id: "bk-a", name: "Book A" },
  { id: "bk-b", name: "Book B" },
  { id: "bk-c", name: "Book C" },
  { id: "bk-d", name: "Book D" },
  { id: "bk-e", name: "Book E" },
  { id: "bk-f", name: "Book F" },
];

const TEAM_NAMES: Record<string, Array<[string, string]>> = {
  pd: [
    ["Northbridge FC", "NBR"],
    ["Kingsport United", "KSP"],
    ["Ashford Rovers", "ASH"],
    ["Redcliffe Athletic", "RED"],
    ["Harrow Vale", "HAR"],
    ["Westmere City", "WES"],
    ["Stonegate Town", "STO"],
    ["Brightwater Albion", "BRI"],
  ],
  lp: [
    ["Real Costa Verde", "RCV"],
    ["Atlético Sierra", "ATS"],
    ["CD Puerto Alto", "CPA"],
    ["Valle Oscuro CF", "VOC"],
    ["UD Montaña", "UDM"],
    ["Deportivo Arena", "DAR"],
    ["Sporting Lago", "SLA"],
    ["Racing Mirador", "RMI"],
  ],
  pbl: [
    ["Harbor City Hawks", "HCH"],
    ["Summit Peaks", "SUM"],
    ["Ironwood Titans", "IRT"],
    ["Lakeshore Lynx", "LKL"],
    ["Desert Vipers", "DSV"],
    ["Capital Comets", "CAP"],
    ["Riverside Royals", "RIV"],
    ["Metro Monarchs", "MET"],
  ],
  ehl: [
    ["Frostvale Wolves", "FRW"],
    ["Polar Bay Bears", "PBB"],
    ["Granite Falls Grizzlies", "GFG"],
    ["Aurora Lights", "AUR"],
    ["Cold Creek Kings", "CCK"],
    ["Northern Pike", "NPK"],
  ],
};

const FIRST_NAMES = [
  "Aron", "Bastian", "Caleb", "Dario", "Elias", "Felix", "Gideon", "Hugo", "Isak", "Jonas",
  "Kai", "Luca", "Mateo", "Nico", "Oskar", "Pavel", "Quinn", "Rafael", "Soren", "Tobias",
  "Umar", "Viktor", "Wes", "Xavi", "Yanis", "Zane", "Adrian", "Bruno", "Cyrus", "Dante",
];

const LAST_NAMES = [
  "Halvorsen", "Marquez", "Okafor", "Lindqvist", "Brennan", "Castell", "Dorsey", "Ekström",
  "Fairfax", "Garrido", "Holloway", "Ivanov", "Jansen", "Kowalski", "Lacroix", "Moreau",
  "Novak", "Ortega", "Petrov", "Quintero", "Rasmussen", "Salazar", "Thorne", "Ueda",
  "Valdés", "Whitlock", "Yilmaz", "Zielinski", "Abara", "Belmonte", "Calloway", "Duarte",
];

/** Per-player stat means used by the generators (not part of the public Player type). */
export type MarketMeans = Record<string, number>;

interface PositionTemplate {
  position: string;
  markets: Record<string, [number, number]>;
}

const POSITIONS: Record<SportId, PositionTemplate[]> = {
  football: [
    { position: "Forward", markets: { "Shots on Target": [0.9, 1.8], Shots: [2.2, 4.0], "Goals Scored": [0.3, 0.65] } },
    { position: "Midfielder", markets: { Shots: [1.1, 2.4], Passes: [38, 62], Tackles: [1.2, 2.6] } },
    { position: "Defender", markets: { Tackles: [1.6, 3.0], Passes: [42, 70], Clearances: [3.0, 5.5] } },
  ],
  basketball: [
    { position: "Guard", markets: { Points: [18, 29], Assists: [5, 9.5], "Threes Made": [2.0, 4.2] } },
    { position: "Wing", markets: { Points: [14, 23], Rebounds: [4.5, 7.5], "Threes Made": [1.5, 3.0] } },
    { position: "Center", markets: { Points: [12, 21], Rebounds: [8, 12.5], Blocks: [1.0, 2.6] } },
  ],
  "ice-hockey": [
    { position: "Forward", markets: { "Shots on Goal": [2.4, 4.1], Points: [0.55, 1.15] } },
    { position: "Defense", markets: { "Shots on Goal": [1.4, 2.5], "Blocked Shots": [1.4, 2.6] } },
  ],
};

export interface ReferenceSet {
  sports: Sport[];
  leagues: League[];
  teams: Team[];
  players: Player[];
  bookmakers: Bookmaker[];
  playerMeans: Map<string, MarketMeans>;
}

function buildTeams(rng: Rng): Team[] {
  return LEAGUES.flatMap((league) =>
    (TEAM_NAMES[league.id] ?? []).map(([name, shortName], i) => ({
      id: `${league.id}-${shortName.toLowerCase()}`,
      name,
      shortName,
      leagueId: league.id,
      sportId: league.sportId,
      rating: Math.round(uniform(rng, 55, 92) - i * 0.5),
    })),
  );
}

function buildPlayers(rng: Rng, teams: Team[]) {
  const used = new Set<string>();
  const players: Player[] = [];
  const playerMeans = new Map<string, MarketMeans>();

  for (const team of teams) {
    for (const template of POSITIONS[team.sportId] ?? []) {
      let name = "";
      do {
        name = `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`;
      } while (used.has(name));
      used.add(name);

      const id = `p-${team.id}-${template.position.toLowerCase()}`;
      players.push({ id, name, teamId: team.id, sportId: team.sportId, position: template.position });

      const means: MarketMeans = {};
      // Better teams get a small boost to attacking output.
      const quality = (team.rating - 70) / 100;
      for (const [market, [lo, hi]] of Object.entries(template.markets)) {
        means[market] = uniform(rng, lo, hi) * (1 + quality * 0.3);
      }
      playerMeans.set(id, means);
    }
  }
  return { players, playerMeans };
}

let cached: ReferenceSet | null = null;

export function getReferenceSet(): ReferenceSet {
  if (cached) return cached;
  const rng = createRng(20261012);
  const teams = buildTeams(rng);
  const { players, playerMeans } = buildPlayers(rng, teams);
  cached = { sports: SPORTS, leagues: LEAGUES, teams, players, bookmakers: BOOKMAKERS, playerMeans };
  return cached;
}
