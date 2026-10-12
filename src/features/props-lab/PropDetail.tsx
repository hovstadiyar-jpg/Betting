"use client";

import type { ReactNode } from "react";
import type { PropSide } from "@/lib/domain/types";
import { impliedProbability } from "@/lib/domain/odds";
import { formatOdds, formatPct } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { BarChart } from "@/components/charts/BarChart";
import { EvIndicator } from "@/components/data/EvIndicator";
import { HitRate } from "@/components/data/HitStrip";

export interface PropDetailData {
  title: string;
  subtitle: string;
  market: string;
  line: number;
  openingLine: number;
  overOdds: number;
  underOdds: number;
  projection: number;
  recent: number[];
  bestSide: PropSide;
  ev: number;
  hitRates: Array<{ label: string; rate: number }>;
  extra?: Array<{ label: string; value: ReactNode }>;
}

function Metric({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-line bg-surface-2 px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wider text-ink-3">{label}</div>
      <div className="mt-0.5 text-sm text-ink">{children}</div>
    </div>
  );
}

/** Side panel for a selected player or team prop. */
export function PropDetail({ data }: { data: PropDetailData | undefined }) {
  if (!data) {
    return (
      <Card>
        <CardBody className="py-16 text-center text-sm text-ink-3">Select a row to see the game log and pricing breakdown.</CardBody>
      </Card>
    );
  }

  const last10 = data.recent.slice(-10);
  const lineMoved = data.openingLine !== data.line;

  return (
    <Card>
      <CardHeader
        title={data.title}
        subtitle={data.subtitle}
        actions={<Badge tone="warning">Demo</Badge>}
      />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <div className="text-xs text-ink-3">{data.market}</div>
            <div className="text-xl font-semibold text-ink tabular">
              Line {data.line}
              {lineMoved ? (
                <span className="ml-2 text-xs font-normal text-ink-3">
                  opened {data.openingLine} {data.line > data.openingLine ? "▲" : "▼"}
                </span>
              ) : null}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-ink-3">Model leans</div>
            <div className="flex items-center gap-2">
              <Badge tone={data.ev > 0 ? "positive" : "neutral"}>{data.bestSide === "over" ? "Over" : "Under"}</Badge>
              <EvIndicator ev={data.ev} meter={false} />
            </div>
          </div>
        </div>

        <BarChart
          data={last10.map((v, i) => ({ label: `G${data.recent.length - last10.length + i + 1}`, value: v }))}
          threshold={data.line}
          thresholdLabel={`Line ${data.line}`}
          showValues
          height={170}
          legend={{ above: "Over the line", below: "Under / push" }}
          ariaLabel={`${data.market}: last ${last10.length} games against line ${data.line}`}
        />

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Metric label="Projection">
            <span className={cn("font-mono tabular", data.projection > data.line ? "text-pos" : "text-ink")}>{data.projection.toFixed(1)}</span>
          </Metric>
          <Metric label="Over">
            <span className="font-mono tabular">{formatOdds(data.overOdds)}</span>
            <span className="ml-1 text-[11px] text-ink-3">{formatPct(impliedProbability(data.overOdds), 0)}</span>
          </Metric>
          <Metric label="Under">
            <span className="font-mono tabular">{formatOdds(data.underOdds)}</span>
            <span className="ml-1 text-[11px] text-ink-3">{formatPct(impliedProbability(data.underOdds), 0)}</span>
          </Metric>
          {data.hitRates.map((h) => (
            <Metric key={h.label} label={`Hit rate ${h.label}`}>
              <HitRate rate={h.rate} />
            </Metric>
          ))}
          {data.extra?.map((e) => (
            <Metric key={e.label} label={e.label}>
              {e.value}
            </Metric>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
