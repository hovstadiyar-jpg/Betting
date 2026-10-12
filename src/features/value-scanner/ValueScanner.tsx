"use client";

import { useMemo, useState } from "react";
import type { Match, ValueOpportunity } from "@/lib/domain/types";
import { DEFAULT_FILTERS, matchesFilters, type MarketFilterState } from "@/lib/domain/filters";
import { createLookup, type ReferenceLike } from "@/lib/domain/lookup";
import { formatOdds, formatSignedPct } from "@/lib/utils/format";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { MarketFilters } from "@/components/data/MarketFilters";
import { ValueTable } from "@/components/data/ValueTable";

interface ValueScannerProps {
  opportunities: ValueOpportunity[];
  matches: Match[];
  reference: ReferenceLike;
  initialLeague?: string;
}

export function ValueScanner({ opportunities, matches, reference, initialLeague }: ValueScannerProps) {
  const [filters, setFilters] = useState<MarketFilterState>(() => {
    const league = reference.leagues.find((l) => l.id === initialLeague);
    return league ? { ...DEFAULT_FILTERS, leagueId: league.id, sportId: league.sportId } : DEFAULT_FILTERS;
  });
  const lookup = useMemo(() => createLookup(reference), [reference]);
  const matchById = useMemo(() => new Map(matches.map((m) => [m.id, m])), [matches]);
  const markets = useMemo(() => [...new Set(opportunities.map((o) => o.marketName))].sort(), [opportunities]);

  const rows = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    return opportunities.filter((o) => {
      const m = matchById.get(o.matchId);
      if (!m) return false;
      const ok = matchesFilters(
        { sportId: m.sportId, leagueId: m.leagueId, teamId: m.homeTeamId, opponentId: m.awayTeamId, market: o.marketName, ev: o.ev },
        filters,
      );
      if (!ok) return false;
      if (!q) return true;
      const haystack = `${lookup.teamName(m.homeTeamId)} ${lookup.teamName(m.awayTeamId)} ${o.selectionLabel} ${o.marketName}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [opportunities, filters, matchById, lookup]);

  const avgEv = rows.length ? rows.reduce((s, r) => s + r.ev, 0) / rows.length : 0;
  const avgOdds = rows.length ? rows.reduce((s, r) => s + r.bestOdds, 0) / rows.length : 0;
  const top = rows.reduce<ValueOpportunity | undefined>((b, r) => (!b || r.ev > b.ev ? r : b), undefined);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <MarketFilters value={filters} onChange={setFilters} reference={reference} fields={["query", "sport", "league", "team", "market", "minEv"]} markets={markets} />
      </Card>

      <section aria-label="Filtered summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Opportunities" value={rows.length} hint={`of ${opportunities.length} flagged`} />
        <StatTile label="Average EV" value={formatSignedPct(avgEv)} hint="Mean across filtered rows" />
        <StatTile label="Average best price" value={rows.length ? formatOdds(avgOdds) : "—"} hint="Decimal odds" />
        <StatTile label="Top opportunity" value={top ? formatSignedPct(top.ev) : "—"} hint={top ? `${top.selectionLabel} · ${top.marketName}` : "No rows"} />
      </section>

      <Card>
        <ValueTable rows={rows} matches={matches} reference={reference} />
      </Card>
    </div>
  );
}
