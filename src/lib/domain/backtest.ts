import type { HistoricalBet, SportId } from "./types";
import { closingLineValue } from "./odds";

export type StakingMethod = "flat" | "proportional";

export interface BacktestParams {
  sportId: SportId | "all";
  marketType: HistoricalBet["marketType"] | "all";
  minEv: number;
  minOdds: number;
  maxOdds: number;
  staking: StakingMethod;
}

export interface EquityPoint {
  index: number;
  date: string;
  bankroll: number;
}

export interface BacktestResult {
  bets: number;
  wins: number;
  hitRate: number;
  staked: number;
  profit: number;
  roi: number;
  maxDrawdown: number;
  averageOdds: number;
  averageEv: number;
  averageClv: number;
  longestLosingStreak: number;
  equity: EquityPoint[];
  byMonth: Array<{ month: string; profit: number; bets: number }>;
}

export const DEFAULT_BACKTEST_PARAMS: BacktestParams = {
  sportId: "all",
  marketType: "all",
  minEv: 0.02,
  minOdds: 1.5,
  maxOdds: 5,
  staking: "flat",
};

/**
 * Replays historical bets under the given filter and staking rules.
 * Units: 1 unit flat stake; "proportional" scales stake with EV (1u per 5% EV,
 * capped at 3u). Starting bankroll is 0 units so the curve shows P/L directly.
 */
export function runBacktest(history: HistoricalBet[], params: BacktestParams): BacktestResult {
  const selected = history
    .filter((b) => params.sportId === "all" || b.sportId === params.sportId)
    .filter((b) => params.marketType === "all" || b.marketType === params.marketType)
    .filter((b) => b.ev >= params.minEv && b.odds >= params.minOdds && b.odds <= params.maxOdds)
    .sort((a, b) => a.date.localeCompare(b.date));

  let bankroll = 0;
  let peak = 0;
  let maxDrawdown = 0;
  let staked = 0;
  let wins = 0;
  let streak = 0;
  let longestLosingStreak = 0;
  let oddsSum = 0;
  let evSum = 0;
  let clvSum = 0;
  const equity: EquityPoint[] = [];
  const months = new Map<string, { profit: number; bets: number }>();

  selected.forEach((bet, index) => {
    const stake = params.staking === "flat" ? 1 : Math.min(3, Math.max(0.25, bet.ev / 0.05));
    const pnl = bet.won ? stake * (bet.odds - 1) : -stake;
    bankroll += pnl;
    staked += stake;
    oddsSum += bet.odds;
    evSum += bet.ev;
    clvSum += closingLineValue(bet.odds, bet.closingOdds);

    if (bet.won) {
      wins += 1;
      streak = 0;
    } else {
      streak += 1;
      longestLosingStreak = Math.max(longestLosingStreak, streak);
    }

    peak = Math.max(peak, bankroll);
    maxDrawdown = Math.max(maxDrawdown, peak - bankroll);
    equity.push({ index, date: bet.date, bankroll });

    const month = bet.date.slice(0, 7);
    const entry = months.get(month) ?? { profit: 0, bets: 0 };
    entry.profit += pnl;
    entry.bets += 1;
    months.set(month, entry);
  });

  const n = selected.length;
  return {
    bets: n,
    wins,
    hitRate: n ? wins / n : 0,
    staked,
    profit: bankroll,
    roi: staked ? bankroll / staked : 0,
    maxDrawdown,
    averageOdds: n ? oddsSum / n : 0,
    averageEv: n ? evSum / n : 0,
    averageClv: n ? clvSum / n : 0,
    longestLosingStreak,
    equity,
    byMonth: [...months.entries()].map(([month, v]) => ({ month, ...v })),
  };
}
