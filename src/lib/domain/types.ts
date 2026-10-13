/**
 * Core domain types for BettingValue.
 *
 * These types are the contract between the UI and the data layer. The mock
 * provider produces them from synthetic generators; the HTTP provider maps the
 * FastAPI backend's responses onto them (see src/lib/api/http-provider.ts).
 */

/** Known demo sports plus any sport key the backend reports (e.g. "american-football"). */
export type SportId = "football" | "basketball" | "ice-hockey" | (string & {});

export interface Sport {
  id: SportId;
  name: string;
}

export interface League {
  id: string;
  name: string;
  sportId: SportId;
  region: string;
}

export interface Team {
  id: string;
  name: string;
  shortName: string;
  leagueId: string;
  sportId: SportId;
  /** Synthetic strength rating used by the demo generator (0–100). */
  rating: number;
}

export interface Player {
  id: string;
  name: string;
  teamId: string;
  sportId: SportId;
  position: string;
}

export interface Bookmaker {
  id: string;
  name: string;
}

/** Where a dataset came from. Phase 1 only ever produces "synthetic". */
export type DataSource = "synthetic" | "live";

export interface DatasetMeta {
  source: DataSource;
  /** ISO timestamp the dataset represents. */
  asOf: string;
  /** Seconds since the dataset was last refreshed at render time. */
  ageSeconds: number;
}

export interface Dataset<T> {
  meta: DatasetMeta;
  data: T;
}

export type MatchStatus = "scheduled" | "live" | "finished";

export interface Match {
  id: string;
  sportId: SportId;
  leagueId: string;
  homeTeamId: string;
  awayTeamId: string;
  kickoff: string;
  status: MatchStatus;
}

/** Market families available across the platform. */
export type MarketType = "match-result" | "moneyline" | "total" | "handicap" | "btts" | "player-prop" | "team-prop";

export interface OddsQuote {
  bookmakerId: string;
  odds: number;
}

/** One selectable outcome in a market, with every bookmaker's price. */
export interface Selection {
  id: string;
  label: string;
  quotes: OddsQuote[];
  /** Model "fair" probability (synthetic in Phase 1). */
  modelProbability: number;
}

export interface Market {
  id: string;
  matchId: string;
  type: MarketType;
  name: string;
  /** Line for totals / handicaps. */
  line?: number;
  selections: Selection[];
}

/** A selection whose best available price exceeds the model's fair price. */
export interface ValueOpportunity {
  id: string;
  matchId: string;
  marketId: string;
  marketType: MarketType;
  marketName: string;
  selectionLabel: string;
  bestOdds: number;
  bestBookmakerId: string;
  fairOdds: number;
  modelProbability: number;
  impliedProbability: number;
  ev: number;
  /** Model confidence 0–1 (synthetic). */
  confidence: number;
}

export type PropSide = "over" | "under";

export interface PlayerProp {
  id: string;
  matchId: string;
  playerId: string;
  teamId: string;
  opponentId: string;
  sportId: SportId;
  leagueId: string;
  market: string;
  line: number;
  overOdds: number;
  underOdds: number;
  projection: number;
  /** Values from the most recent games, oldest first. */
  recent: number[];
  hitRateL5: number;
  hitRateL10: number;
  hitRateL20: number;
  bestSide: PropSide;
  ev: number;
  /** Opponent's rank conceding this stat (1 = concedes the most). */
  opponentRank: number;
  openingLine: number;
}

export interface TeamProp {
  id: string;
  matchId: string;
  teamId: string;
  opponentId: string;
  sportId: SportId;
  leagueId: string;
  market: string;
  line: number;
  overOdds: number;
  underOdds: number;
  projection: number;
  recent: number[];
  hitRateL10: number;
  bestSide: PropSide;
  ev: number;
  openingLine: number;
}

export interface Trend {
  id: string;
  kind: "player" | "team";
  subjectId: string;
  sportId: SportId;
  leagueId: string;
  market: string;
  line: number;
  side: PropSide;
  hits: number;
  sample: number;
  recent: number[];
  description: string;
  /** Whether the trend's subject plays in an upcoming fixture. */
  upcomingMatchId?: string;
}

export interface Matchup {
  id: string;
  matchId: string;
  playerId: string;
  opponentId: string;
  sportId: SportId;
  leagueId: string;
  market: string;
  playerAverage: number;
  opponentConcededAverage: number;
  leagueAverage: number;
  opponentRank: number;
  /** Positive = favourable for the over. */
  edgeScore: number;
}

export interface PricePoint {
  /** ISO timestamp */
  t: string;
  odds: number;
}

export interface LineMovement {
  id: string;
  category: "match" | "player-prop" | "team-prop";
  matchId: string;
  /** Player or team the movement relates to (props only). */
  subjectId?: string;
  /** Prop line at open / now (props only). */
  openingLine?: number;
  currentLine?: number;
  sportId: SportId;
  leagueId: string;
  marketName: string;
  selectionLabel: string;
  bookmakerId: string;
  openingOdds: number;
  currentOdds: number;
  history: PricePoint[];
  /** Percentage change in implied probability, opening → current. */
  impliedShift: number;
  steam: boolean;
}

export interface HistoricalBet {
  id: string;
  date: string;
  sportId: SportId;
  leagueId: string;
  marketType: MarketType;
  selection: string;
  odds: number;
  closingOdds: number;
  modelProbability: number;
  ev: number;
  won: boolean;
}

export interface TeamForm {
  teamId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  scored: number;
  conceded: number;
  /** Most recent last. */
  lastFive: Array<"W" | "D" | "L">;
  /** Per-game points/goals scored for the recent window, oldest first. */
  scoringTrend: number[];
  concedingTrend: number[];
  homeRecord: string;
  awayRecord: string;
  pace?: number;
  xgFor?: number;
  xgAgainst?: number;
}

export interface PlayerProfile {
  playerId: string;
  gamesPlayed: number;
  minutesAvg: number;
  /** Season averages per market label. */
  averages: Record<string, number>;
  /** Recent values per market label, oldest first. */
  recentByMarket: Record<string, number[]>;
  usageRate?: number;
  injuryStatus: "available" | "questionable" | "out";
}

export interface DashboardSummary {
  valueBetsCount: number;
  averageEv: number;
  topEv: number;
  matchesTracked: number;
  bookmakersTracked: number;
  propsTracked: number;
  /** Model calibration headline; absent when no model is deployed. */
  modelBrierScore?: number;
  /** EV opportunity count per hour, oldest first; absent when not tracked. */
  opportunitiesTrend?: number[];
}

export interface SearchEntry {
  id: string;
  kind: "team" | "player" | "match" | "league";
  label: string;
  sublabel: string;
  href: string;
}
