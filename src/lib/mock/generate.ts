/**
 * Synthetic demo database.
 *
 * Generates a self-consistent, deterministic dataset (fixtures, odds, props,
 * trends, line movements, history) from fictional reference data. Nothing here
 * is sourced from a real bookmaker or data feed.
 */
import type {
  HistoricalBet,
  LineMovement,
  Market,
  MarketType,
  Match,
  Matchup,
  PlayerProfile,
  PlayerProp,
  PricePoint,
  Selection,
  Team,
  TeamForm,
  TeamProp,
  Trend,
  ValueOpportunity,
} from "@/lib/domain/types";
import { expectedValue, fairOdds, hitRate, impliedProbability } from "@/lib/domain/odds";
import { getReferenceSet, type ReferenceSet } from "./reference";
import {
  clamp,
  createRng,
  intBetween,
  normal,
  normalCdf,
  pick,
  poisson,
  poissonCdf,
  type Rng,
  round1,
  round2,
  uniform,
} from "./random";

/** Fixed "now" for the demo dataset so renders are reproducible. */
export const DEMO_ANCHOR_MS = Date.UTC(2026, 9, 12, 12, 0, 0);
export const DEMO_ANCHOR_ISO = new Date(DEMO_ANCHOR_MS).toISOString();

const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

export interface DemoDatabase {
  reference: ReferenceSet;
  matches: Match[];
  markets: Market[];
  valueOpportunities: ValueOpportunity[];
  playerProps: PlayerProp[];
  teamProps: TeamProp[];
  trends: Trend[];
  matchups: Matchup[];
  lineMovements: LineMovement[];
  teamForms: TeamForm[];
  playerProfiles: PlayerProfile[];
  historicalBets: HistoricalBet[];
}

/* ------------------------------------------------------------------ */
/* Statistical helpers                                                 */
/* ------------------------------------------------------------------ */

const isCountStat = (mean: number) => mean < 6;
const sdFor = (mean: number) => Math.max(1.5, mean * 0.22);

function sampleStat(rng: Rng, mean: number): number {
  if (isCountStat(mean)) return poisson(rng, Math.max(0.05, mean));
  return Math.max(0, Math.round(normal(rng, mean, sdFor(mean))));
}

function probOver(line: number, mean: number): number {
  const p = isCountStat(mean) ? 1 - poissonCdf(Math.floor(line), mean) : 1 - normalCdf(line, mean, sdFor(mean));
  return clamp(p, 0.04, 0.96);
}

function lineFor(rng: Rng, mean: number): number {
  if (isCountStat(mean)) return Math.max(0.5, Math.floor(mean + 0.5 + normal(rng, 0, 0.2)) - 0.5);
  return Math.floor(mean + normal(rng, 0, sdFor(mean) * 0.1)) + 0.5;
}

function priceFromProbability(p: number, margin: number): number {
  return round2(clamp(1 / (clamp(p, 0.03, 0.97) * (1 + margin)), 1.04, 15));
}

const logistic = (x: number) => 1 / (1 + Math.exp(-x));

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const average = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

/** Round-robin pairings via the circle method. */
function roundPairings<T>(items: T[], round: number): Array<[T, T]> {
  const [fixed, ...rest] = items;
  if (fixed === undefined) return [];
  const rotated = rest.map((_, i) => rest[(i + round) % rest.length] as T);
  const circle = [fixed, ...rotated];
  const pairs: Array<[T, T]> = [];
  for (let i = 0; i < circle.length / 2; i += 1) {
    const a = circle[i] as T;
    const b = circle[circle.length - 1 - i] as T;
    pairs.push(round % 2 === 0 ? [a, b] : [b, a]);
  }
  return pairs;
}

function buildMatches(ref: ReferenceSet): Match[] {
  const roundsByLeague: Record<string, number> = { pd: 2, lp: 2, pbl: 2, ehl: 1 };
  const offsetByLeague: Record<string, number> = { pd: 0, lp: 1.25, pbl: 6.5, ehl: 7.5 };
  const matches: Match[] = [];

  for (const league of ref.leagues) {
    const teams = ref.teams.filter((t) => t.leagueId === league.id);
    for (let round = 0; round < (roundsByLeague[league.id] ?? 1); round += 1) {
      roundPairings(teams, round).forEach(([home, away], i) => {
        const live = round === 0 && i === 0 && (league.id === "pd" || league.id === "pbl");
        const kickoffMs = live
          ? DEMO_ANCHOR_MS - 0.75 * HOUR
          : DEMO_ANCHOR_MS + (round * 24 + 2 + (offsetByLeague[league.id] ?? 0) + i * 2.25) * HOUR;
        matches.push({
          id: `m-${league.id}-${round}-${i}`,
          sportId: league.sportId,
          leagueId: league.id,
          homeTeamId: home.id,
          awayTeamId: away.id,
          kickoff: iso(Math.round(kickoffMs / (15 * 60_000)) * 15 * 60_000),
          status: live ? "live" : "scheduled",
        });
      });
    }
  }
  return matches.sort((a, b) => a.kickoff.localeCompare(b.kickoff));
}

/* ------------------------------------------------------------------ */
/* Match markets & odds                                                */
/* ------------------------------------------------------------------ */

interface RawSelection {
  label: string;
  p: number;
}

interface RawMarket {
  type: MarketType;
  name: string;
  line?: number;
  selections: RawSelection[];
}

function rawMarketsFor(rng: Rng, match: Match, home: Team, away: Team): RawMarket[] {
  const diff = (home.rating - away.rating) / 100;

  if (match.sportId === "football") {
    const draw = clamp(0.27 - Math.abs(diff) * 0.25, 0.18, 0.3);
    const homeShare = logistic(diff * 6 + 0.25);
    const lambda = 2.55 + (home.rating + away.rating - 146) / 55 + normal(rng, 0, 0.12);
    const lh = lambda * clamp(homeShare, 0.3, 0.7);
    const la = lambda - lh;
    const over = 1 - poissonCdf(2, lambda);
    const btts = (1 - Math.exp(-lh)) * (1 - Math.exp(-la));
    return [
      {
        type: "match-result",
        name: "Match Result",
        selections: [
          { label: home.name, p: (1 - draw) * homeShare },
          { label: "Draw", p: draw },
          { label: away.name, p: (1 - draw) * (1 - homeShare) },
        ],
      },
      {
        type: "total",
        name: "Total Goals",
        line: 2.5,
        selections: [
          { label: "Over 2.5", p: over },
          { label: "Under 2.5", p: 1 - over },
        ],
      },
      {
        type: "btts",
        name: "Both Teams to Score",
        selections: [
          { label: "Yes", p: btts },
          { label: "No", p: 1 - btts },
        ],
      },
    ];
  }

  if (match.sportId === "basketball") {
    const pHome = logistic(diff * 7 + 0.18);
    const spread = Math.round(diff * 40 + 2.5) - 0.5;
    const total = Math.floor(222 + (home.rating + away.rating - 146) * 0.6 + normal(rng, 0, 4)) + 0.5;
    const cover = clamp(0.5 + normal(rng, 0, 0.03), 0.42, 0.58);
    const over = clamp(0.5 + normal(rng, 0, 0.03), 0.42, 0.58);
    const fmt = (n: number) => (n > 0 ? `+${n}` : `${n}`);
    return [
      {
        type: "moneyline",
        name: "Moneyline",
        selections: [
          { label: home.name, p: pHome },
          { label: away.name, p: 1 - pHome },
        ],
      },
      {
        type: "handicap",
        name: "Point Spread",
        line: -spread,
        selections: [
          { label: `${home.shortName} ${fmt(-spread)}`, p: cover },
          { label: `${away.shortName} ${fmt(spread)}`, p: 1 - cover },
        ],
      },
      {
        type: "total",
        name: "Total Points",
        line: total,
        selections: [
          { label: `Over ${total}`, p: over },
          { label: `Under ${total}`, p: 1 - over },
        ],
      },
    ];
  }

  // Ice hockey
  const pHome = logistic(diff * 4.5 + 0.12);
  const lambda = 5.7 + normal(rng, 0, 0.3);
  const over = 1 - poissonCdf(5, lambda);
  return [
    {
      type: "moneyline",
      name: "Moneyline (incl. OT)",
      selections: [
        { label: home.name, p: pHome },
        { label: away.name, p: 1 - pHome },
      ],
    },
    {
      type: "total",
      name: "Total Goals",
      line: 5.5,
      selections: [
        { label: "Over 5.5", p: over },
        { label: "Under 5.5", p: 1 - over },
      ],
    },
  ];
}

function buildMarkets(rng: Rng, ref: ReferenceSet, matches: Match[]): Market[] {
  const teamById = new Map(ref.teams.map((t) => [t.id, t]));
  const markets: Market[] = [];

  for (const match of matches) {
    const home = teamById.get(match.homeTeamId);
    const away = teamById.get(match.awayTeamId);
    if (!home || !away) continue;

    rawMarketsFor(rng, match, home, away).forEach((raw, mi) => {
      const marketId = `${match.id}-mk${mi}`;
      // Each bookmaker has its own margin and some don't price every market.
      const books = ref.bookmakers
        .map((b) => ({ id: b.id, margin: uniform(rng, 0.045, 0.08), offers: rng() > 0.12 }))
        .filter((b, i) => b.offers || i < 3);

      const selections: Selection[] = raw.selections.map((s, si) => ({
        id: `${marketId}-s${si}`,
        label: s.label,
        modelProbability: clamp(s.p * (1 + normal(rng, 0, 0.05)), 0.02, 0.98),
        quotes: books.map((b) => ({
          bookmakerId: b.id,
          odds: priceFromProbability(s.p * (1 + clamp(normal(rng, 0, 0.02), -0.04, 0.04)), b.margin),
        })),
      }));

      markets.push({ id: marketId, matchId: match.id, type: raw.type, name: raw.name, line: raw.line, selections });
    });
  }
  return markets;
}

function buildValueOpportunities(rng: Rng, markets: Market[]): ValueOpportunity[] {
  const out: ValueOpportunity[] = [];
  for (const market of markets) {
    for (const s of market.selections) {
      const best = s.quotes.reduce((a, b) => (b.odds > a.odds ? b : a), s.quotes[0] ?? { bookmakerId: "", odds: 0 });
      if (!best.bookmakerId) continue;
      const ev = expectedValue(best.odds, s.modelProbability);
      if (ev <= 0.005) continue;
      out.push({
        id: `vo-${s.id}`,
        matchId: market.matchId,
        marketId: market.id,
        marketType: market.type,
        marketName: market.name,
        selectionLabel: s.label,
        bestOdds: best.odds,
        bestBookmakerId: best.bookmakerId,
        fairOdds: round2(fairOdds(s.modelProbability)),
        modelProbability: s.modelProbability,
        impliedProbability: impliedProbability(best.odds),
        ev,
        confidence: round2(uniform(rng, 0.45, 0.95)),
      });
    }
  }
  return out.sort((a, b) => b.ev - a.ev);
}

/* ------------------------------------------------------------------ */
/* Props                                                               */
/* ------------------------------------------------------------------ */

const TEAM_PROP_MARKETS: Record<Match["sportId"], Array<{ market: string; mean: (t: Team) => number }>> = {
  football: [
    { market: "Team Goals", mean: (t) => 1.25 + (t.rating - 70) / 45 },
    { market: "Team Corners", mean: (t) => 4.6 + (t.rating - 70) / 18 },
    { market: "Team Cards", mean: (t) => 2.1 - (t.rating - 70) / 60 },
  ],
  basketball: [
    { market: "Team Points", mean: (t) => 110 + (t.rating - 70) * 0.45 },
    { market: "1st Half Points", mean: (t) => 55 + (t.rating - 70) * 0.22 },
    { market: "Team Threes", mean: (t) => 12.5 + (t.rating - 70) * 0.08 },
  ],
  "ice-hockey": [
    { market: "Team Goals", mean: (t) => 2.9 + (t.rating - 70) / 40 },
    { market: "Team Shots", mean: (t) => 30 + (t.rating - 70) * 0.18 },
  ],
};

interface PropCore {
  line: number;
  overOdds: number;
  underOdds: number;
  projection: number;
  bestSide: "over" | "under";
  ev: number;
  openingLine: number;
}

function priceProp(rng: Rng, mean: number, projection: number): PropCore {
  const line = lineFor(rng, mean);
  // The synthetic book prices in most of the matchup adjustment, so edges stay realistic (mostly low single digits).
  const bookMean = mean + (projection - mean) * 0.75;
  const bookP = probOver(line, bookMean * (1 + normal(rng, 0, isCountStat(mean) ? 0.03 : 0.012)));
  const modelP = probOver(line, projection);
  const margin = uniform(rng, 0.025, 0.04);
  const overOdds = priceFromProbability(bookP, margin);
  const underOdds = priceFromProbability(1 - bookP, margin);
  const evOver = expectedValue(overOdds, modelP);
  const evUnder = expectedValue(underOdds, 1 - modelP);
  const moved = rng() < 0.3;
  const step = isCountStat(mean) ? 1 : Math.max(1, Math.round(mean * 0.04));
  return {
    line,
    overOdds,
    underOdds,
    projection: round1(projection),
    bestSide: evOver >= evUnder ? "over" : "under",
    ev: Math.max(evOver, evUnder),
    openingLine: moved ? Math.max(0.5, line + (rng() < 0.5 ? -step : step)) : line,
  };
}

/** Rank 1 = concedes the most of this stat to opponents. Stable per team/market. */
function concessionRank(ref: ReferenceSet, team: Team, market: string): number {
  const leagueTeams = ref.teams.filter((t) => t.leagueId === team.leagueId);
  const seeded = createRng(hashString(`${team.leagueId}|${market}`));
  const scored = leagueTeams
    .map((t) => ({ id: t.id, weakness: -t.rating + normal(seeded, 0, 8) }))
    .sort((a, b) => b.weakness - a.weakness);
  return scored.findIndex((s) => s.id === team.id) + 1;
}

function buildPlayerHistories(rng: Rng, ref: ReferenceSet) {
  const histories = new Map<string, Record<string, number[]>>();
  for (const player of ref.players) {
    const means = ref.playerMeans.get(player.id) ?? {};
    const record: Record<string, number[]> = {};
    for (const [market, mean] of Object.entries(means)) {
      record[market] = Array.from({ length: 20 }, () => sampleStat(rng, mean * (1 + normal(rng, 0, 0.08))));
    }
    histories.set(player.id, record);
  }
  return histories;
}

function buildPlayerProps(
  rng: Rng,
  ref: ReferenceSet,
  matches: Match[],
  histories: Map<string, Record<string, number[]>>,
): PlayerProp[] {
  const teamById = new Map(ref.teams.map((t) => [t.id, t]));
  const props: PlayerProp[] = [];

  for (const match of matches) {
    for (const [teamId, opponentId] of [
      [match.homeTeamId, match.awayTeamId],
      [match.awayTeamId, match.homeTeamId],
    ] as const) {
      const opponent = teamById.get(opponentId);
      if (!opponent) continue;
      const leagueSize = ref.teams.filter((t) => t.leagueId === opponent.leagueId).length;

      for (const player of ref.players.filter((p) => p.teamId === teamId)) {
        const means = ref.playerMeans.get(player.id) ?? {};
        for (const [market, mean] of Object.entries(means)) {
          const opponentRank = concessionRank(ref, opponent, market);
          const matchupFactor = 1 + (((leagueSize + 1) / 2 - opponentRank) / leagueSize) * 0.16;
          const projection = mean * matchupFactor * (1 + normal(rng, 0, 0.03));
          const core = priceProp(rng, mean, projection);
          const recent = histories.get(player.id)?.[market] ?? [];
          props.push({
            id: `pp-${match.id}-${player.id}-${market.replace(/\W+/g, "").toLowerCase()}`,
            matchId: match.id,
            playerId: player.id,
            teamId,
            opponentId,
            sportId: match.sportId,
            leagueId: match.leagueId,
            market,
            recent,
            hitRateL5: hitRate(recent.slice(-5), core.line),
            hitRateL10: hitRate(recent.slice(-10), core.line),
            hitRateL20: hitRate(recent, core.line),
            opponentRank,
            ...core,
          });
        }
      }
    }
  }
  return props;
}

function buildTeamProps(rng: Rng, ref: ReferenceSet, matches: Match[]): TeamProp[] {
  const teamById = new Map(ref.teams.map((t) => [t.id, t]));
  const props: TeamProp[] = [];

  for (const match of matches) {
    for (const [teamId, opponentId] of [
      [match.homeTeamId, match.awayTeamId],
      [match.awayTeamId, match.homeTeamId],
    ] as const) {
      const team = teamById.get(teamId);
      const opponent = teamById.get(opponentId);
      if (!team || !opponent) continue;
      for (const { market, mean: meanFn } of TEAM_PROP_MARKETS[match.sportId]) {
        const mean = Math.max(0.4, meanFn(team));
        const projection = mean * (1 + (team.rating - opponent.rating) / 400) * (1 + normal(rng, 0, 0.03));
        const core = priceProp(rng, mean, projection);
        const recent = Array.from({ length: 20 }, () => sampleStat(rng, mean * (1 + normal(rng, 0, 0.08))));
        props.push({
          id: `tp-${match.id}-${teamId}-${market.replace(/\W+/g, "").toLowerCase()}`,
          matchId: match.id,
          teamId,
          opponentId,
          sportId: match.sportId,
          leagueId: match.leagueId,
          market,
          recent,
          hitRateL10: hitRate(recent.slice(-10), core.line),
          ...core,
        });
      }
    }
  }
  return props;
}

function buildTrends(ref: ReferenceSet, playerProps: PlayerProp[], teamProps: TeamProp[]): Trend[] {
  const playerName = new Map(ref.players.map((p) => [p.id, p.name]));
  const teamName = new Map(ref.teams.map((t) => [t.id, t.name]));
  const trends: Trend[] = [];
  const scores = new Map<string, number>();
  const seen = new Set<string>();

  const consider = (
    kind: Trend["kind"],
    id: string,
    subjectId: string,
    name: string,
    base: { sportId: Trend["sportId"]; leagueId: string; market: string; line: number; recent: number[]; matchId: string; projection: number },
  ) => {
    // A player/team with two upcoming fixtures shares one history; report the streak once.
    const key = `${subjectId}|${base.market}`;
    if (seen.has(key)) return;
    seen.add(key);
    const last10 = base.recent.slice(-10);
    const overHits = last10.filter((v) => v > base.line).length;
    const side = overHits >= 7 ? "over" : overHits <= 3 ? "under" : null;
    if (!side) return;
    const hits = side === "over" ? overHits : last10.length - overHits;
    // Rank by how unusual the streak is relative to the model's own expectation.
    const expectedOver = probOver(base.line, Math.max(0.05, base.projection));
    const expected = side === "over" ? expectedOver : 1 - expectedOver;
    scores.set(id, hits / last10.length - expected);
    trends.push({
      id,
      kind,
      subjectId,
      sportId: base.sportId,
      leagueId: base.leagueId,
      market: base.market,
      line: base.line,
      side,
      hits,
      sample: last10.length,
      recent: last10,
      description: `${name} has gone ${side} ${base.line} ${base.market.toLowerCase()} in ${hits} of the last ${last10.length}`,
      upcomingMatchId: base.matchId,
    });
  };

  for (const p of playerProps) consider("player", `tr-${p.id}`, p.playerId, playerName.get(p.playerId) ?? "Player", p);
  for (const p of teamProps) consider("team", `tr-${p.id}`, p.teamId, teamName.get(p.teamId) ?? "Team", p);

  return trends.sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0));
}

function buildMatchups(ref: ReferenceSet, playerProps: PlayerProp[]): Matchup[] {
  const leagueAvg = new Map<string, number>();
  const leagueSize = new Map<string, number>();
  for (const league of ref.leagues) leagueSize.set(league.id, ref.teams.filter((t) => t.leagueId === league.id).length);

  for (const key of new Set(playerProps.map((p) => `${p.leagueId}|${p.market}`))) {
    const [leagueId, market] = key.split("|");
    const values = ref.players
      .filter((p) => ref.teams.find((t) => t.id === p.teamId)?.leagueId === leagueId)
      .map((p) => ref.playerMeans.get(p.id)?.[market ?? ""])
      .filter((v): v is number => v !== undefined);
    leagueAvg.set(key, average(values));
  }

  return playerProps.map((p) => {
    const avg = leagueAvg.get(`${p.leagueId}|${p.market}`) ?? 1;
    const n = leagueSize.get(p.leagueId) ?? 8;
    const conceded = avg * (1 + (((n + 1) / 2 - p.opponentRank) / n) * 0.3);
    const edge = (conceded / avg - 1) * 100 + ((p.projection - p.line) / Math.max(p.line, 1)) * 40;
    return {
      id: `mu-${p.id}`,
      matchId: p.matchId,
      playerId: p.playerId,
      opponentId: p.opponentId,
      sportId: p.sportId,
      leagueId: p.leagueId,
      market: p.market,
      playerAverage: round1(average(p.recent)),
      opponentConcededAverage: round1(conceded),
      leagueAverage: round1(avg),
      opponentRank: p.opponentRank,
      edgeScore: round1(edge),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Line movement                                                       */
/* ------------------------------------------------------------------ */

function priceHistory(rng: Rng, opening: number, current: number, steam: boolean): PricePoint[] {
  const steps = 24;
  const walk: number[] = [0];
  for (let i = 1; i <= steps; i += 1) walk.push((walk[i - 1] ?? 0) + normal(rng, 0, 1));
  const end = walk[steps] ?? 0;
  const scale = Math.abs(current - opening) * 0.12 + opening * 0.006;
  return walk.map((w, i) => {
    const progress = i / steps;
    // Steam moves happen late and sharply; drifts are gradual.
    const shape = steam ? logistic((progress - 0.82) * 30) : progress;
    const bridge = w - progress * end;
    const odds = opening + (current - opening) * shape + (i === 0 || i === steps ? 0 : bridge * scale);
    return { t: iso(DEMO_ANCHOR_MS - (steps - i) * 2 * HOUR), odds: round2(Math.max(1.01, odds)) };
  });
}

function movement(
  rng: Rng,
  base: Omit<LineMovement, "history" | "impliedShift" | "steam" | "openingOdds">,
): LineMovement {
  const drift = normal(rng, 0, 0.04);
  const steam = Math.abs(drift) > 0.08;
  const openingOdds = round2(Math.max(1.02, base.currentOdds * (1 + drift)));
  return {
    ...base,
    openingOdds,
    history: priceHistory(rng, openingOdds, base.currentOdds, steam),
    impliedShift: openingOdds / base.currentOdds - 1,
    steam,
  };
}

function buildLineMovements(
  rng: Rng,
  ref: ReferenceSet,
  markets: Market[],
  matches: Match[],
  playerProps: PlayerProp[],
  teamProps: TeamProp[],
): LineMovement[] {
  const matchById = new Map(matches.map((m) => [m.id, m]));
  const playerName = new Map(ref.players.map((p) => [p.id, p.name]));
  const teamName = new Map(ref.teams.map((t) => [t.id, t.name]));
  const out: LineMovement[] = [];

  for (const market of markets) {
    const match = matchById.get(market.matchId);
    if (!match) continue;
    for (const s of market.selections) {
      const quote = s.quotes[0];
      if (!quote || rng() > 0.45) continue;
      out.push(
        movement(rng, {
          id: `lm-${s.id}`,
          category: "match",
          matchId: match.id,
          sportId: match.sportId,
          leagueId: match.leagueId,
          marketName: market.name,
          selectionLabel: s.label,
          bookmakerId: pick(rng, s.quotes).bookmakerId,
          currentOdds: quote.odds,
        }),
      );
    }
  }

  for (const p of playerProps) {
    if (p.openingLine === p.line && rng() > 0.12) continue;
    out.push(
      movement(rng, {
        id: `lm-${p.id}`,
        category: "player-prop",
        matchId: p.matchId,
        subjectId: p.playerId,
        sportId: p.sportId,
        leagueId: p.leagueId,
        marketName: `${playerName.get(p.playerId) ?? "Player"} · ${p.market}`,
        selectionLabel: `Over ${p.line}`,
        bookmakerId: "demo-props",
        currentOdds: p.overOdds,
        openingLine: p.openingLine,
        currentLine: p.line,
      }),
    );
  }

  for (const p of teamProps) {
    if (p.openingLine === p.line && rng() > 0.2) continue;
    out.push(
      movement(rng, {
        id: `lm-${p.id}`,
        category: "team-prop",
        matchId: p.matchId,
        subjectId: p.teamId,
        sportId: p.sportId,
        leagueId: p.leagueId,
        marketName: `${teamName.get(p.teamId) ?? "Team"} · ${p.market}`,
        selectionLabel: `Over ${p.line}`,
        bookmakerId: "demo-props",
        currentOdds: p.overOdds,
        openingLine: p.openingLine,
        currentLine: p.line,
      }),
    );
  }

  return out.sort((a, b) => Math.abs(b.impliedShift) - Math.abs(a.impliedShift));
}

/* ------------------------------------------------------------------ */
/* Team form, player profiles, history                                 */
/* ------------------------------------------------------------------ */

function buildTeamForms(rng: Rng, ref: ReferenceSet): TeamForm[] {
  return ref.teams.map((team) => {
    const q = team.rating - 70;
    const sampleFor = (sign: 1 | -1) => {
      if (team.sportId === "basketball") return Math.round(normal(rng, 111 + sign * q * 0.45, 10));
      if (team.sportId === "ice-hockey") return poisson(rng, Math.max(1.2, 2.9 + (sign * q) / 40));
      return poisson(rng, Math.max(0.4, 1.3 + (sign * q) / 45));
    };
    const scored = Array.from({ length: 10 }, () => sampleFor(1));
    const conceded = Array.from({ length: 10 }, () => sampleFor(-1));
    const results = scored.map((s, i) => {
      const c = conceded[i] ?? 0;
      if (s > c) return "W" as const;
      if (s < c) return "L" as const;
      return team.sportId === "football" ? ("D" as const) : rng() < 0.5 ? ("W" as const) : ("L" as const);
    });
    const count = (r: "W" | "D" | "L") => results.filter((x) => x === r).length;
    const homeW = intBetween(rng, 0, count("W"));
    const fmt = (w: number, d: number, l: number) => (team.sportId === "football" ? `${w}-${d}-${l}` : `${w}-${l}`);
    const homeD = intBetween(rng, 0, count("D"));
    const homeL = intBetween(rng, 0, count("L"));

    return {
      teamId: team.id,
      played: 10,
      wins: count("W"),
      draws: count("D"),
      losses: count("L"),
      scored: scored.reduce((a, b) => a + b, 0),
      conceded: conceded.reduce((a, b) => a + b, 0),
      lastFive: results.slice(-5),
      scoringTrend: scored,
      concedingTrend: conceded,
      homeRecord: fmt(homeW, homeD, homeL),
      awayRecord: fmt(count("W") - homeW, count("D") - homeD, count("L") - homeL),
      pace: team.sportId === "basketball" ? round1(uniform(rng, 95, 104)) : undefined,
      xgFor: team.sportId === "football" ? round2(Math.max(0.5, 1.35 + q / 45 + normal(rng, 0, 0.1))) : undefined,
      xgAgainst: team.sportId === "football" ? round2(Math.max(0.5, 1.35 - q / 50 + normal(rng, 0, 0.1))) : undefined,
    };
  });
}

function buildPlayerProfiles(
  rng: Rng,
  ref: ReferenceSet,
  histories: Map<string, Record<string, number[]>>,
): PlayerProfile[] {
  const minutes: Record<string, [number, number]> = {
    football: [68, 90],
    basketball: [25, 37],
    "ice-hockey": [14, 23],
  };
  return ref.players.map((player) => {
    const history = histories.get(player.id) ?? {};
    const [lo, hi] = minutes[player.sportId] ?? [20, 30];
    const roll = rng();
    return {
      playerId: player.id,
      gamesPlayed: intBetween(rng, 14, 24),
      minutesAvg: round1(uniform(rng, lo, hi)),
      averages: Object.fromEntries(Object.entries(history).map(([m, values]) => [m, round1(average(values))])),
      recentByMarket: Object.fromEntries(Object.entries(history).map(([m, values]) => [m, values.slice(-10)])),
      usageRate: player.sportId === "basketball" ? round1(uniform(rng, 16, 31)) : undefined,
      injuryStatus: roll < 0.9 ? "available" : roll < 0.97 ? "questionable" : "out",
    };
  });
}

function buildHistoricalBets(rng: Rng, ref: ReferenceSet): HistoricalBet[] {
  const marketTypesBySport: Record<string, HistoricalBet["marketType"][]> = {
    football: ["match-result", "total", "btts", "player-prop", "team-prop"],
    basketball: ["moneyline", "handicap", "total", "player-prop", "team-prop"],
    "ice-hockey": ["moneyline", "total", "player-prop"],
  };
  const start = Date.UTC(2026, 0, 5);
  const span = Date.UTC(2026, 9, 10) - start;
  const bets: HistoricalBet[] = [];

  for (let i = 0; i < 900; i += 1) {
    const league = pick(rng, ref.leagues);
    const teams = ref.teams.filter((t) => t.leagueId === league.id);
    const home = pick(rng, teams);
    const away = pick(rng, teams.filter((t) => t.id !== home.id));
    const marketType: HistoricalBet["marketType"] = pick(rng, marketTypesBySport[league.sportId] ?? ["total" as const]);
    const odds = round2(clamp(1.35 + Math.abs(normal(rng, 0, 1.2)), 1.3, 7.5));
    const trueEdge = normal(rng, 0.005, 0.045);
    const trueP = clamp((1 / odds) * (1 + trueEdge), 0.02, 0.97);
    const modelEv = trueEdge + normal(rng, 0.012, 0.03);
    bets.push({
      id: `hb-${i}`,
      date: iso(start + rng() * span).slice(0, 10),
      sportId: league.sportId,
      leagueId: league.id,
      marketType,
      selection: `${home.shortName} v ${away.shortName} · ${marketType.replace("-", " ")}`,
      odds,
      closingOdds: round2(Math.max(1.01, odds * (1 - trueEdge * 0.5 + normal(rng, 0, 0.02)))),
      modelProbability: clamp((1 / odds) * (1 + modelEv), 0.01, 0.99),
      ev: modelEv,
      won: rng() < trueP,
    });
  }
  return bets.sort((a, b) => a.date.localeCompare(b.date));
}

/* ------------------------------------------------------------------ */

let cachedDb: DemoDatabase | null = null;

export function getDemoDatabase(): DemoDatabase {
  if (cachedDb) return cachedDb;
  const ref = getReferenceSet();
  const rng = createRng(4242);

  const matches = buildMatches(ref);
  const markets = buildMarkets(rng, ref, matches);
  const valueOpportunities = buildValueOpportunities(rng, markets);
  const histories = buildPlayerHistories(rng, ref);
  const playerProps = buildPlayerProps(rng, ref, matches, histories);
  const teamProps = buildTeamProps(rng, ref, matches);

  cachedDb = {
    reference: ref,
    matches,
    markets,
    valueOpportunities,
    playerProps,
    teamProps,
    trends: buildTrends(ref, playerProps, teamProps),
    matchups: buildMatchups(ref, playerProps),
    lineMovements: buildLineMovements(rng, ref, markets, matches, playerProps, teamProps),
    teamForms: buildTeamForms(rng, ref),
    playerProfiles: buildPlayerProfiles(rng, ref, histories),
    historicalBets: buildHistoricalBets(rng, ref),
  };
  return cachedDb;
}
