/**
 * Data-access contract.
 *
 * UI code depends only on this interface — never on the mock generators.
 * Phase 1 ships `mockProvider` (synthetic data). A later phase adds an HTTP
 * provider that calls the FastAPI backend and returns the same shapes.
 */
import type {
  Bookmaker,
  DashboardSummary,
  Dataset,
  HistoricalBet,
  League,
  LineMovement,
  Market,
  Match,
  Matchup,
  Player,
  PlayerProfile,
  PlayerProp,
  SearchEntry,
  Sport,
  Team,
  TeamForm,
  TeamProp,
  Trend,
  ValueOpportunity,
} from "@/lib/domain/types";

/** Static-ish lookup data shared by most pages (serialisable for client components). */
export interface ReferenceData {
  sports: Sport[];
  leagues: League[];
  teams: Team[];
  players: Player[];
  bookmakers: Bookmaker[];
}

export interface DataProvider {
  getReferenceData(): Promise<ReferenceData>;
  getSearchIndex(): Promise<SearchEntry[]>;
  getDashboardSummary(): Promise<Dataset<DashboardSummary>>;
  getMatches(): Promise<Dataset<Match[]>>;
  getMarkets(matchId?: string): Promise<Dataset<Market[]>>;
  getValueOpportunities(): Promise<Dataset<ValueOpportunity[]>>;
  getPlayerProps(): Promise<Dataset<PlayerProp[]>>;
  getTeamProps(): Promise<Dataset<TeamProp[]>>;
  getTrends(): Promise<Dataset<Trend[]>>;
  getMatchups(): Promise<Dataset<Matchup[]>>;
  getLineMovements(): Promise<Dataset<LineMovement[]>>;
  getTeamForms(): Promise<Dataset<TeamForm[]>>;
  getPlayerProfiles(): Promise<Dataset<PlayerProfile[]>>;
  getHistoricalBets(): Promise<Dataset<HistoricalBet[]>>;
}
