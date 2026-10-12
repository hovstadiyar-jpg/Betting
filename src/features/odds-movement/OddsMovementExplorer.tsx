"use client";

import { useMemo, useState } from "react";
import type { LineMovement, Match } from "@/lib/domain/types";
import { DEFAULT_FILTERS, matchesFilters, type MarketFilterState } from "@/lib/domain/filters";
import { createLookup, type ReferenceLike } from "@/lib/domain/lookup";
import { formatOdds, formatSignedPct } from "@/lib/utils/format";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Segmented } from "@/components/ui/Tabs";
import { StatTile } from "@/components/ui/StatTile";
import { MarketFilters } from "@/components/data/MarketFilters";
import { DataTable, type Column } from "@/components/data/DataTable";
import { MovementChart, ShiftCell } from "@/features/props-lab/LineMovementTab";

type Direction = "all" | "shortening" | "drifting" | "steam";
type Scope = "match" | "props" | "all";

interface OddsMovementExplorerProps {
  movements: LineMovement[];
  matches: Match[];
  reference: ReferenceLike;
}

export function OddsMovementExplorer({ movements, matches, reference }: OddsMovementExplorerProps) {
  const lookup = useMemo(() => createLookup(reference), [reference]);
  const matchById = useMemo(() => new Map(matches.map((m) => [m.id, m])), [matches]);
  const [filters, setFilters] = useState<MarketFilterState>(DEFAULT_FILTERS);
  const [direction, setDirection] = useState<Direction>("all");
  const [scope, setScope] = useState<Scope>("match");
  const [selectedId, setSelectedId] = useState<string | undefined>();

  const markets = useMemo(() => [...new Set(movements.filter((m) => m.category === "match").map((m) => m.marketName))].sort(), [movements]);

  const rows = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    return movements.filter((m) => {
      if (scope === "match" && m.category !== "match") return false;
      if (scope === "props" && m.category === "match") return false;
      if (direction === "shortening" && m.impliedShift <= 0) return false;
      if (direction === "drifting" && m.impliedShift >= 0) return false;
      if (direction === "steam" && !m.steam) return false;
      const match = matchById.get(m.matchId);
      if (!match) return false;
      const market = m.category === "match" ? m.marketName : undefined;
      if (!matchesFilters({ sportId: m.sportId, leagueId: m.leagueId, teamId: match.homeTeamId, opponentId: match.awayTeamId, market }, filters)) return false;
      if (!q) return true;
      return `${m.marketName} ${m.selectionLabel} ${lookup.teamName(match.homeTeamId)} ${lookup.teamName(match.awayTeamId)}`.toLowerCase().includes(q);
    });
  }, [movements, filters, direction, scope, matchById, lookup]);

  const selected = rows.find((r) => r.id === selectedId) ?? rows[0];
  const steamCount = rows.filter((r) => r.steam).length;
  const shortest = rows.reduce<LineMovement | undefined>((b, r) => (!b || r.impliedShift > b.impliedShift ? r : b), undefined);
  const drift = rows.reduce<LineMovement | undefined>((b, r) => (!b || r.impliedShift < b.impliedShift ? r : b), undefined);
  const avgAbs = rows.length ? rows.reduce((s, r) => s + Math.abs(r.impliedShift), 0) / rows.length : 0;

  const columns: Column<LineMovement>[] = [
    {
      key: "event",
      header: "Event",
      sortValue: (m) => matchById.get(m.matchId)?.kickoff ?? "",
      render: (m) => {
        const match = matchById.get(m.matchId);
        return match ? (
          <div className="min-w-40">
            <div className="text-ink">
              {lookup.teamShort(match.homeTeamId)} <span className="text-ink-3">v</span> {lookup.teamShort(match.awayTeamId)}
            </div>
            <div className="text-[11px] text-ink-3">{lookup.leagueName(match.leagueId)}</div>
          </div>
        ) : null;
      },
    },
    {
      key: "sel",
      header: "Selection",
      sortValue: (m) => m.selectionLabel,
      render: (m) => (
        <div>
          <div className="font-medium text-ink">{m.selectionLabel}</div>
          <div className="text-[11px] text-ink-3">{m.marketName}</div>
        </div>
      ),
    },
    { key: "book", header: "Book", render: (m) => <span className="text-xs">{lookup.bookmakerName(m.bookmakerId)}</span>, hideBelow: "lg" },
    { key: "open", header: "Open", align: "right", sortValue: (m) => m.openingOdds, render: (m) => <span className="font-mono tabular text-ink-3">{formatOdds(m.openingOdds)}</span>, hideBelow: "sm" },
    { key: "now", header: "Now", align: "right", sortValue: (m) => m.currentOdds, render: (m) => <span className="font-mono font-semibold tabular text-ink">{formatOdds(m.currentOdds)}</span> },
    { key: "shift", header: "Implied shift", align: "right", sortValue: (m) => m.impliedShift, render: (m) => <ShiftCell shift={m.impliedShift} /> },
    { key: "flag", header: "", align: "right", render: (m) => (m.steam ? <Badge tone="warning">Steam</Badge> : null), hideBelow: "md" },
  ];

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap gap-3">
          <Segmented
            ariaLabel="Market scope"
            value={scope}
            onChange={setScope}
            options={[
              { id: "match", label: "Match markets" },
              { id: "props", label: "Props" },
              { id: "all", label: "All" },
            ]}
          />
          <Segmented
            ariaLabel="Direction"
            value={direction}
            onChange={setDirection}
            options={[
              { id: "all", label: "All moves" },
              { id: "shortening", label: "Shortening" },
              { id: "drifting", label: "Drifting" },
              { id: "steam", label: "Steam only" },
            ]}
          />
        </div>
        <MarketFilters
          value={filters}
          onChange={setFilters}
          reference={reference}
          fields={scope === "match" ? ["query", "sport", "league", "team", "market"] : ["query", "sport", "league", "team"]}
          markets={markets}
        />
      </Card>

      <section aria-label="Movement summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Moves tracked" value={rows.length} hint={`${steamCount} flagged as steam`} />
        <StatTile label="Avg. absolute shift" value={formatSignedPct(avgAbs).replace("+", "")} hint="Implied probability, open → now" />
        <StatTile label="Biggest shortener" value={shortest ? formatSignedPct(shortest.impliedShift) : "—"} hint={shortest?.selectionLabel ?? ""} />
        <StatTile label="Biggest drifter" value={drift ? formatSignedPct(drift.impliedShift) : "—"} hint={drift?.selectionLabel ?? ""} />
      </section>

      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(m) => m.id}
            initialSort={{ key: "shift", direction: "desc" }}
            onRowClick={(m) => setSelectedId(m.id)}
            selectedKey={selected?.id}
            maxRows={80}
            dense
            caption="Odds movements"
          />
        </Card>
        <div className="xl:sticky xl:top-20 xl:col-span-2 xl:self-start">{selected ? <MovementChart movement={selected} lookup={lookup} /> : null}</div>
      </div>
      <p className="text-[11px] text-ink-3">
        Implied shift = opening odds ÷ current odds − 1. Positive values mean the price shortened (market now rates the outcome more likely). Steam marks a
        large, late, fast move.
      </p>
    </div>
  );
}
