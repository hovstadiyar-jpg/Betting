"use client";

import { useMemo, useState } from "react";
import type { PlayerProp } from "@/lib/domain/types";
import type { Lookup } from "@/lib/domain/lookup";
import { formatOdds } from "@/lib/utils/format";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/data/DataTable";
import { EvIndicator } from "@/components/data/EvIndicator";
import { HitRate } from "@/components/data/HitStrip";
import { PropDetail } from "./PropDetail";

/** Default selection: the highest-EV row (matches the table's initial sort). */
export function topByEv<T extends { ev: number }>(rows: T[]): T | undefined {
  return rows.reduce<T | undefined>((best, r) => (!best || r.ev > best.ev ? r : best), undefined);
}

export function LineCell({ line, openingLine }: { line: number; openingLine: number }) {
  const moved = line !== openingLine;
  return (
    <span className="inline-flex items-center gap-1 font-mono tabular text-ink">
      {line}
      {moved ? (
        <span className={line > openingLine ? "text-[9px] text-pos" : "text-[9px] text-neg"} title={`Opened ${openingLine}`}>
          {line > openingLine ? "▲" : "▼"}
        </span>
      ) : null}
    </span>
  );
}

export function PlayerPropsTab({ rows, lookup }: { rows: PlayerProp[]; lookup: Lookup }) {
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const selected = useMemo(() => rows.find((r) => r.id === selectedId) ?? topByEv(rows), [rows, selectedId]);

  const columns: Column<PlayerProp>[] = [
    {
      key: "player",
      header: "Player",
      sortValue: (p) => lookup.playerName(p.playerId),
      render: (p) => (
        <div className="min-w-36">
          <div className="font-medium text-ink">{lookup.playerName(p.playerId)}</div>
          <div className="text-[11px] text-ink-3">
            {lookup.teamShort(p.teamId)} v {lookup.teamShort(p.opponentId)} · {lookup.player(p.playerId)?.position}
          </div>
        </div>
      ),
    },
    { key: "market", header: "Market", sortValue: (p) => p.market, render: (p) => p.market },
    { key: "line", header: "Line", align: "right", sortValue: (p) => p.line, render: (p) => <LineCell line={p.line} openingLine={p.openingLine} /> },
    { key: "over", header: "Over", align: "right", sortValue: (p) => p.overOdds, render: (p) => <span className="font-mono tabular">{formatOdds(p.overOdds)}</span> },
    { key: "under", header: "Under", align: "right", sortValue: (p) => p.underOdds, render: (p) => <span className="font-mono tabular">{formatOdds(p.underOdds)}</span>, hideBelow: "sm" },
    { key: "proj", header: "Proj", align: "right", sortValue: (p) => p.projection, render: (p) => <span className="font-mono tabular">{p.projection.toFixed(1)}</span>, hideBelow: "2xl" },
    { key: "l5", header: "L5", align: "right", sortValue: (p) => p.hitRateL5, render: (p) => <HitRate rate={p.hitRateL5} />, hideBelow: "2xl" },
    { key: "l10", header: "L10", align: "right", sortValue: (p) => p.hitRateL10, render: (p) => <HitRate rate={p.hitRateL10} />, hideBelow: "md" },
    { key: "l20", header: "L20", align: "right", sortValue: (p) => p.hitRateL20, render: (p) => <HitRate rate={p.hitRateL20} />, hideBelow: "2xl" },
    {
      key: "opp",
      header: "Opp rk",
      align: "right",
      sortValue: (p) => -p.opponentRank,
      render: (p) => <span className="font-mono tabular" title="Opponent rank conceding this stat (1 = most conceded)">{p.opponentRank}</span>,
      hideBelow: "2xl",
    },
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
          caption="Player props"
        />
      </Card>
      <div className="xl:sticky xl:top-20 xl:self-start">
        <PropDetail
          data={
            selected && {
              title: lookup.playerName(selected.playerId),
              subtitle: `${lookup.teamName(selected.teamId)} v ${lookup.teamName(selected.opponentId)}`,
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
                { label: "L5", rate: selected.hitRateL5 },
                { label: "L10", rate: selected.hitRateL10 },
                { label: "L20", rate: selected.hitRateL20 },
              ],
              extra: [
                { label: "Opp. rank", value: <span className="font-mono tabular">{selected.opponentRank}</span> },
                { label: "Season avg", value: <span className="font-mono tabular">{(selected.recent.reduce((a, b) => a + b, 0) / Math.max(1, selected.recent.length)).toFixed(1)}</span> },
                { label: "Position", value: lookup.player(selected.playerId)?.position ?? "—" },
              ],
            }
          }
        />
      </div>
    </div>
  );
}
