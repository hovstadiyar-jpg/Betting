"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Match } from "@/lib/domain/types";
import type { MatchSummary } from "@/lib/domain/markets";
import { createLookup, type ReferenceLike } from "@/lib/domain/lookup";
import { formatKickoff, formatOdds, formatSignedPct } from "@/lib/utils/format";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "./DataTable";

interface MatchTableProps {
  matches: Match[];
  reference: ReferenceLike;
  summaries: Record<string, MatchSummary>;
  maxRows?: number;
  dense?: boolean;
}

/** Fixture list with best primary-market prices and value counts. Rows open the Match Analyzer. */
export function MatchTable({ matches, reference, summaries, maxRows, dense }: MatchTableProps) {
  const router = useRouter();
  const lookup = useMemo(() => createLookup(reference), [reference]);

  const odds = (v?: number) => (v ? <span className="font-mono tabular text-ink">{formatOdds(v)}</span> : <span className="text-ink-3">—</span>);

  const columns: Column<Match>[] = [
    {
      key: "kickoff",
      header: "Kick-off",
      sortValue: (m) => m.kickoff,
      render: (m) =>
        m.status === "live" ? (
          <Badge tone="negative">
            <span className="size-1.5 animate-pulse rounded-full bg-neg" /> Live
          </Badge>
        ) : (
          <span className="font-mono text-xs tabular text-ink-3">{formatKickoff(m.kickoff)}</span>
        ),
    },
    {
      key: "fixture",
      header: "Fixture",
      sortValue: (m) => lookup.teamName(m.homeTeamId),
      render: (m) => (
        <div className="min-w-44">
          <div className="font-medium text-ink">
            {lookup.teamName(m.homeTeamId)} <span className="text-ink-3">v</span> {lookup.teamName(m.awayTeamId)}
          </div>
          <div className="text-[11px] text-ink-3">{lookup.leagueName(m.leagueId)}</div>
        </div>
      ),
    },
    { key: "home", header: "1", align: "right", render: (m) => odds(summaries[m.id]?.home), hideBelow: "sm" },
    { key: "draw", header: "X", align: "right", render: (m) => odds(summaries[m.id]?.draw), hideBelow: "sm" },
    { key: "away", header: "2", align: "right", render: (m) => odds(summaries[m.id]?.away), hideBelow: "sm" },
    {
      key: "value",
      header: "Value",
      align: "right",
      sortValue: (m) => summaries[m.id]?.topEv ?? 0,
      render: (m) => {
        const s = summaries[m.id];
        if (!s || s.valueCount === 0) return <span className="text-ink-3">—</span>;
        return (
          <span className="inline-flex items-center gap-2">
            <Badge tone="accent">{s.valueCount}</Badge>
            <span className="font-mono text-xs tabular text-pos">{formatSignedPct(s.topEv)}</span>
          </span>
        );
      },
    },
  ];

  return (
    <DataTable
      rows={matches}
      columns={columns}
      rowKey={(m) => m.id}
      maxRows={maxRows}
      dense={dense}
      onRowClick={(m) => router.push(`/match-analyzer?match=${m.id}`)}
      caption="Upcoming fixtures"
    />
  );
}
