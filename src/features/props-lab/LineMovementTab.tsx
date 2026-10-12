"use client";

import { useMemo, useState } from "react";
import type { LineMovement } from "@/lib/domain/types";
import type { Lookup } from "@/lib/domain/lookup";
import { formatOdds, formatShortDate, formatSignedPct, formatTime } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/data/DataTable";
import { LineChart } from "@/components/charts/LineChart";

export function ShiftCell({ shift }: { shift: number }) {
  // Positive shift = implied probability rose (price shortened).
  const tone = Math.abs(shift) < 0.02 ? "text-ink-3" : shift > 0 ? "text-pos" : "text-neg";
  return (
    <span className={cn("font-mono tabular", tone)}>
      {shift > 0 ? "▲" : shift < 0 ? "▼" : ""} {formatSignedPct(shift)}
    </span>
  );
}

export function MovementChart({ movement, lookup }: { movement: LineMovement; lookup: Lookup }) {
  const values = movement.history.map((p) => p.odds);
  return (
    <Card>
      <CardHeader
        title={movement.marketName}
        subtitle={`${movement.selectionLabel} · ${lookup.bookmakerName(movement.bookmakerId)}`}
        actions={movement.steam ? <Badge tone="warning">Steam</Badge> : <Badge tone="warning">Demo</Badge>}
      />
      <CardBody className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md border border-line bg-surface-2 py-2">
            <div className="text-[10px] uppercase tracking-wider text-ink-3">Open</div>
            <div className="font-mono text-sm tabular text-ink">{formatOdds(movement.openingOdds)}</div>
          </div>
          <div className="rounded-md border border-line bg-surface-2 py-2">
            <div className="text-[10px] uppercase tracking-wider text-ink-3">Current</div>
            <div className="font-mono text-sm tabular text-ink">{formatOdds(movement.currentOdds)}</div>
          </div>
          <div className="rounded-md border border-line bg-surface-2 py-2">
            <div className="text-[10px] uppercase tracking-wider text-ink-3">Implied shift</div>
            <div className="text-sm">
              <ShiftCell shift={movement.impliedShift} />
            </div>
          </div>
        </div>
        {movement.openingLine !== undefined && movement.currentLine !== undefined && movement.openingLine !== movement.currentLine ? (
          <p className="text-xs text-ink-3">
            Line moved {movement.openingLine} → <span className="text-ink">{movement.currentLine}</span>
          </p>
        ) : null}
        <LineChart
          series={[{ id: "price", label: "Price", values }]}
          xLabels={movement.history.map((p) => `${formatShortDate(p.t)} ${formatTime(p.t)}`)}
          references={[{ value: movement.openingOdds, label: "Open" }]}
          height={200}
          area
          ariaLabel={`Price history for ${movement.marketName}`}
        />
      </CardBody>
    </Card>
  );
}

export function LineMovementTab({ rows, lookup }: { rows: LineMovement[]; lookup: Lookup }) {
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const selected = useMemo(() => rows.find((r) => r.id === selectedId) ?? rows[0], [rows, selectedId]);

  const columns: Column<LineMovement>[] = [
    {
      key: "market",
      header: "Prop",
      sortValue: (m) => m.marketName,
      render: (m) => (
        <div className="min-w-40">
          <div className="font-medium text-ink">{m.marketName}</div>
          <div className="text-[11px] text-ink-3">{m.category === "player-prop" ? "Player prop" : "Team prop"}</div>
        </div>
      ),
    },
    {
      key: "line",
      header: "Line",
      align: "right",
      sortValue: (m) => (m.currentLine ?? 0) - (m.openingLine ?? 0),
      render: (m) =>
        m.openingLine !== undefined && m.currentLine !== undefined && m.openingLine !== m.currentLine ? (
          <span className="font-mono tabular">
            <span className="text-ink-3">{m.openingLine} →</span> <span className="text-ink">{m.currentLine}</span>
          </span>
        ) : (
          <span className="font-mono tabular text-ink-3">{m.currentLine ?? "—"}</span>
        ),
    },
    {
      key: "odds",
      header: "Over price",
      align: "right",
      hideBelow: "sm",
      sortValue: (m) => m.currentOdds,
      render: (m) => (
        <span className="font-mono tabular">
          <span className="text-ink-3">{formatOdds(m.openingOdds)} →</span> <span className="text-ink">{formatOdds(m.currentOdds)}</span>
        </span>
      ),
    },
    { key: "shift", header: "Shift", align: "right", sortValue: (m) => Math.abs(m.impliedShift), render: (m) => <ShiftCell shift={m.impliedShift} /> },
    { key: "steam", header: "", align: "right", render: (m) => (m.steam ? <Badge tone="warning">Steam</Badge> : null), hideBelow: "md" },
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(m) => m.id}
          initialSort={{ key: "shift", direction: "desc" }}
          onRowClick={(m) => setSelectedId(m.id)}
          selectedKey={selected?.id}
          maxRows={60}
          dense
          caption="Prop line movement"
        />
      </Card>
      <div className="xl:sticky xl:top-20 xl:self-start">{selected ? <MovementChart movement={selected} lookup={lookup} /> : null}</div>
    </div>
  );
}
