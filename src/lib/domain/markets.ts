import type { Market, Match, ValueOpportunity } from "./types";

export interface MatchSummary {
  /** Best available price per primary-market outcome (home / draw / away). */
  home?: number;
  draw?: number;
  away?: number;
  valueCount: number;
  topEv: number;
}

export function bestQuote(odds: Array<{ bookmakerId: string; odds: number }>) {
  return odds.reduce<{ bookmakerId: string; odds: number } | undefined>((best, q) => (!best || q.odds > best.odds ? q : best), undefined);
}

/** Pre-computes table-friendly numbers for each match (serialisable). */
export function summarizeMatches(matches: Match[], markets: Market[], opportunities: ValueOpportunity[]): Record<string, MatchSummary> {
  const out: Record<string, MatchSummary> = {};
  for (const match of matches) {
    const primary = markets.find((m) => m.matchId === match.id && (m.type === "match-result" || m.type === "moneyline"));
    const sels = primary?.selections ?? [];
    const best = (i: number) => {
      const s = sels[i];
      return s ? bestQuote(s.quotes)?.odds : undefined;
    };
    const vos = opportunities.filter((v) => v.matchId === match.id);
    out[match.id] = {
      home: best(0),
      draw: sels.length === 3 ? best(1) : undefined,
      away: best(sels.length === 3 ? 2 : 1),
      valueCount: vos.length,
      topEv: vos.reduce((m, v) => Math.max(m, v.ev), 0),
    };
  }
  return out;
}
