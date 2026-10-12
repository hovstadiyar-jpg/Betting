/**
 * Pure betting-math helpers. No I/O, no framework imports — safe to reuse on
 * the server, the client, and in a future Python port's parity tests.
 */

/** Implied probability of decimal odds (includes bookmaker margin). */
export function impliedProbability(decimalOdds: number): number {
  if (decimalOdds <= 1) return 1;
  return 1 / decimalOdds;
}

/** Fair decimal odds for a probability. */
export function fairOdds(probability: number): number {
  if (probability <= 0) return Number.POSITIVE_INFINITY;
  return 1 / probability;
}

/**
 * Expected value per unit staked: p * (odds - 1) - (1 - p) = p * odds - 1.
 * Returned as a fraction (0.05 = +5%).
 */
export function expectedValue(decimalOdds: number, probability: number): number {
  return probability * decimalOdds - 1;
}

/** Bookmaker overround for a complete market (0.05 = 5% margin). */
export function overround(oddsForAllOutcomes: number[]): number {
  return oddsForAllOutcomes.reduce((sum, o) => sum + impliedProbability(o), 0) - 1;
}

/** Remove the margin proportionally to get no-vig probabilities. */
export function noVigProbabilities(oddsForAllOutcomes: number[]): number[] {
  const raw = oddsForAllOutcomes.map(impliedProbability);
  const total = raw.reduce((s, p) => s + p, 0);
  return raw.map((p) => p / total);
}

/** Convert decimal odds to American format. */
export function toAmerican(decimalOdds: number): string {
  if (decimalOdds >= 2) return `+${Math.round((decimalOdds - 1) * 100)}`;
  return `${Math.round(-100 / (decimalOdds - 1))}`;
}

/** Percentage of games in which `values` cleared the line on the given side. */
export function hitRate(values: number[], line: number, side: "over" | "under" = "over"): number {
  if (values.length === 0) return 0;
  const hits = values.filter((v) => (side === "over" ? v > line : v < line)).length;
  return hits / values.length;
}

/** Closing line value: how much better the taken price was than the close. */
export function closingLineValue(takenOdds: number, closingOdds: number): number {
  return takenOdds / closingOdds - 1;
}
