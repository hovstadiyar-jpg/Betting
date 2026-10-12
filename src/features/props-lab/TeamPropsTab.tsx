"use client";

import { useMemo, useState } from "react";
import type { TeamProp } from "@/lib/domain/types";
import type { Lookup } from "@/lib/domain/lookup";
import { formatOdds } from "@/lib/utils/format";
import { hitRate } from "@/lib/domain/odds";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/data/DataTable";
import { EvIndicator } from "@/components/data/EvIndicator";
import { HitRate, HitStrip } from "@/components/data/HitStrip";
import { PropDetail } from "./PropDetail";
import { LineCell, topByEv } from "./PlayerPropsTab";

export function TeamPropsTab({ rows, lookup }: { rows: TeamProp[]; lookup: Lookup }) {
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const selected = useMemo(() => rows.find((r) => r.id === selectedId) ?? topByEv(rows), [rows, selectedId]);

  const columns: Column<TeamProp>[] = [
    {
      key: "team",
      header: "Team",
      sortValue: (p) => lookup.teamName(p.teamId),
      render: (p) => (
        <div className="min-w-36">
          <div className="font-medium text-ink">{lookup.teamName(p.teamId)}</div>
          <div className="text-[11px] text-ink-3">v {lookup.teamName(p.opponentId)}</div>
        </div>
      ),
    },
    { key: "market", header: "Market", sortValue: (p) => p.market, render: (p) => p.market },
    { key: "line", header: "Line", align: "right", sortValue: (p) => p.line, render: (p) => <LineCell line={p.line} openingLine={p.openingLine} /> },
    { key: "over", header: "Over", align: "right", sortValue: (p) => p.overOdds, render: (p) => <span className="font-mono tabular">{formatOdds(p.overOdds)}</span> },
    { key: "under", header: "Under", align: "right", sortValue: (p) => p.underOdds, render: (p) => <span className="font-mono tabular">{formatOdds(p.underOdds)}</span>, hideBelow: "sm" },
    { key: "proj", header: "Proj", align: "right", sortValue: (p) => p.projection, render: (p) => <span className="font-mono tabular">{p.projection.toFixed(1)}</span>, hideBelow: "xl" },
    { key: "l10", header: "L10", align: "right", sortValue: (p) => p.hitRateL10, render: (p) => <HitRate rate={p.hitRateL10} />, hideBelow: "md" },
    { key: "log", header: "Last 5", render: (p) => <HitStrip values={p.recent.slice(-5)} line={p.line} />, hideBelow: "2xl" },
    {
      key: "ev",
      header: "Best side",
      align: "right",
      sortValue: (p) => p.ev,
      render: (p) => (
        <span className="inline-flex items-center gap-1.5">
          <Badge tone={p.bestSide === "over" ? "positive" : "accent"}>{p.bestSide === "over" ? "O" : "U"}</Badge>
          <EvIndicator ev={p.ev} meter={false} />
        </span>
      ),
    },
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(p) => p.id}
          initialSort={{ key: "ev", direction: "desc" }}
          onRowClick={(p) => setSelectedId(p.id)}
          selectedKey={selected?.id}
          maxRows={60}
          dense
          caption="Team props"
        />
      </Card>
      <div className="xl:sticky xl:top-20 xl:self-start">
        <PropDetail
          data={
            selected && {
              title: lookup.teamName(selected.teamId),
              subtitle: `v ${lookup.teamName(selected.opponentId)} · ${lookup.leagueName(selected.leagueId)}`,
              market: selected.market,
              line: selected.line,
              openingLine: selected.openingLine,
              overOdds: selected.overOdds,
              underOdds: selected.underOdds,
              projection: selected.projection,
              recent: selected.recent,
              bestSide: selected.bestSide,
              ev: selected.ev,
              hitRates: [
                { label: "L5", rate: hitRate(selected.recent.slice(-5), selected.line) },
                { label: "L10", rate: selected.hitRateL10 },
                { label: "L20", rate: hitRate(selected.recent, selected.line) },
              ],
            }
          }
        />
      </div>
    </div>
  );
}
