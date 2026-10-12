"use client";

import { useMemo, useState } from "react";
import type { Matchup } from "@/lib/domain/types";
import type { Lookup } from "@/lib/domain/lookup";
import { cn } from "@/lib/utils/cn";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/data/DataTable";

function EdgeScore({ value }: { value: number }) {
  const tone = value >= 8 ? "text-pos" : value <= -8 ? "text-neg" : "text-ink-2";
  return <span className={cn("font-mono tabular", tone)}>{value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1)}</span>;
}

/** Horizontal comparison bar on a shared scale. */
function CompareBar({ label, value, max, emphasis = false }: { label: string; value: number; max: number; emphasis?: boolean }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-ink-3">{label}</span>
        <span className="font-mono tabular text-ink">{value.toFixed(1)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-3">
        <div className={cn("h-full rounded-full", emphasis ? "bg-series-1" : "bg-ink-3")} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
      </div>
    </div>
  );
}

export function MatchupTab({ rows, lookup, leagueSizes }: { rows: Matchup[]; lookup: Lookup; leagueSizes: Record<string, number> }) {
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const sorted = useMemo(() => [...rows].sort((a, b) => b.edgeScore - a.edgeScore), [rows]);
  const selected = sorted.find((r) => r.id === selectedId) ?? sorted[0];

  const columns: Column<Matchup>[] = [
    {
      key: "player",
      header: "Player",
      sortValue: (m) => lookup.playerName(m.playerId),
      render: (m) => (
        <div className="min-w-36">
          <div className="font-medium text-ink">{lookup.playerName(m.playerId)}</div>
          <div className="text-[11px] text-ink-3">vs {lookup.teamName(m.opponentId)}</div>
        </div>
      ),
    },
    { key: "market", header: "Stat", sortValue: (m) => m.market, render: (m) => m.market },
    { key: "pavg", header: "Player avg", align: "right", sortValue: (m) => m.playerAverage, render: (m) => <span className="font-mono tabular">{m.playerAverage.toFixed(1)}</span>, hideBelow: "sm" },
    {
      key: "conc",
      header: "Opp allows",
      align: "right",
      sortValue: (m) => m.opponentConcededAverage / m.leagueAverage,
      render: (m) => (
        <span className="font-mono tabular">
          {m.opponentConcededAverage.toFixed(1)} <span className="text-ink-3">/ {m.leagueAverage.toFixed(1)}</span>
        </span>
      ),
      hideBelow: "md",
    },
    {
      key: "rank",
      header: "Opp rank",
      align: "right",
      sortValue: (m) => -m.opponentRank,
      render: (m) => (
        <span className="font-mono tabular">
          {m.opponentRank}
          <span className="text-ink-3">/{leagueSizes[m.leagueId] ?? "—"}</span>
        </span>
      ),
    },
    { key: "edge", header: "Edge", align: "right", sortValue: (m) => m.edgeScore, render: (m) => <EdgeScore value={m.edgeScore} /> },
  ];

  const max = selected ? Math.max(selected.playerAverage, selected.opponentConcededAverage, selected.leagueAverage) * 1.15 : 1;

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <DataTable
          rows={sorted}
          columns={columns}
          rowKey={(m) => m.id}
          initialSort={{ key: "edge", direction: "desc" }}
          onRowClick={(m) => setSelectedId(m.id)}
          selectedKey={selected?.id}
          maxRows={60}
          dense
          caption="Player vs opponent matchups"
        />
      </Card>
      <div className="xl:sticky xl:top-20 xl:self-start">
        {selected ? (
          <Card>
            <CardHeader
              title={lookup.playerName(selected.playerId)}
              subtitle={`${selected.market} vs ${lookup.teamName(selected.opponentId)}`}
              actions={<Badge tone="warning">Demo</Badge>}
            />
            <CardBody className="space-y-4">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-ink-3">Matchup edge score</span>
                <span className="text-2xl font-semibold">
                  <EdgeScore value={selected.edgeScore} />
                </span>
              </div>
              <CompareBar label="Player average (last 20)" value={selected.playerAverage} max={max} emphasis />
              <CompareBar label={`${lookup.teamShort(selected.opponentId)} allows to this position`} value={selected.opponentConcededAverage} max={max} />
              <CompareBar label="League average" value={selected.leagueAverage} max={max} />
              <p className="text-[11px] leading-4 text-ink-3">
                Opponent ranks {selected.opponentRank} of {leagueSizes[selected.leagueId] ?? "—"} for {selected.market.toLowerCase()} conceded (1 = most generous). Edge
                score blends the opponent&apos;s concession rate with the projection-vs-line gap. Synthetic illustration only.
              </p>
            </CardBody>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
