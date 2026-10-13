"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Match, ValueOpportunity } from "@/lib/domain/types";
import { createLookup, type ReferenceLike } from "@/lib/domain/lookup";
import { formatKickoff, formatOdds, formatPct } from "@/lib/utils/format";
import { DataTable, type Column } from "./DataTable";
import { EvIndicator } from "./EvIndicator";

interface ValueTableProps {
  rows: ValueOpportunity[];
  matches: Match[];
  reference: ReferenceLike;
  maxRows?: number;
  compact?: boolean;
}

/** Value opportunities: best price vs model fair price. */
export function ValueTable({ rows, matches, reference, maxRows, compact = false }: ValueTableProps) {
  const router = useRouter();
  const lookup = useMemo(() => createLookup(reference), [reference]);
  const matchById = useMemo(() => new Map(matches.map((m) => [m.id, m])), [matches]);

  const columns: Column<ValueOpportunity>[] = [
    {
      key: "match",
      header: "Event",
      sortValue: (v) => matchById.get(v.matchId)?.kickoff ?? "",
      render: (v) => {
        const m = matchById.get(v.matchId);
        if (!m) return null;
        return (
          <div className="min-w-44">
            <div className="text-ink">
              {lookup.teamShort(m.homeTeamId)} <span className="text-ink-3">v</span> {lookup.teamShort(m.awayTeamId)}
            </div>
            <div className="text-[11px] text-ink-3">
              {lookup.leagueName(m.leagueId)} · <span className="font-mono">{m.status === "live" ? "LIVE" : formatKickoff(m.kickoff)}</span>
            </div>
          </div>
        );
      },
    },
    {
      key: "selection",
      header: "Selection",
      sortValue: (v) => v.marketName,
      render: (v) => (
        <div>
          <div className="font-medium text-ink">{v.selectionLabel}</div>
          <div className="text-[11px] text-ink-3">{v.marketName}</div>
        </div>
      ),
    },
    {
      key: "best",
      header: "Best",
      align: "right",
      sortValue: (v) => v.bestOdds,
      render: (v) => (
        <div>
          <div className="font-mono font-semibold tabular text-ink">{formatOdds(v.bestOdds)}</div>
          <div className="text-[11px] text-ink-3">{lookup.bookmakerName(v.bestBookmakerId)}</div>
        </div>
      ),
    },
    {
      key: "fair",
      header: "Fair",
      align: "right",
      hideBelow: "md",
      sortValue: (v) => v.fairOdds,
      render: (v) => <span className="font-mono tabular">{formatOdds(v.fairOdds)}</span>,
    },
    {
      key: "prob",
      header: "Fair %",
      align: "right",
      hideBelow: compact ? "lg" : "md",
      sortValue: (v) => v.modelProbability,
      render: (v) => <span className="font-mono tabular">{formatPct(v.modelProbability)}</span>,
    },
    {
      key: "ev",
      header: "EV",
      align: "right",
      sortValue: (v) => v.ev,
      render: (v) => <EvIndicator ev={v.ev} meter={!compact} />,
    },
  ];

  if (!compact) {
    columns.push({
      key: "conf",
      header: "Confidence",
      align: "right",
      hideBelow: "lg",
      sortValue: (v) => v.confidence,
      render: (v) => (
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="h-1 w-10 overflow-hidden rounded-full bg-surface-3">
            <span className="block h-full rounded-full bg-ink-3" style={{ width: `${v.confidence * 100}%` }} />
          </span>
          <span className="font-mono text-xs tabular">{Math.round(v.confidence * 100)}</span>
        </span>
      ),
    });
  }

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(v) => v.id}
      initialSort={{ key: "ev", direction: "desc" }}
      maxRows={maxRows}
      dense={compact}
      onRowClick={(v) => router.push(`/match-analyzer?match=${v.matchId}`)}
      caption="Value opportunities"
    />
  );
}
