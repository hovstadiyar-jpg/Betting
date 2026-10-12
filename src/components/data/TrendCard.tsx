import type { Trend } from "@/lib/domain/types";
import { cn } from "@/lib/utils/cn";
import { Badge } from "@/components/ui/Badge";
import { Sparkline } from "@/components/charts/Sparkline";
import { HitStrip } from "./HitStrip";

interface TrendCardProps {
  trend: Trend;
  subjectName: string;
  context: string;
  className?: string;
}

/** Statistical trend summary: hit count, recent values vs line, and a mini trend line. */
export function TrendCard({ trend, subjectName, context, className }: TrendCardProps) {
  const rate = trend.hits / trend.sample;
  return (
    <article className={cn("flex flex-col gap-3 rounded-lg border border-line bg-surface p-4", className)}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[13px] font-semibold text-ink">{subjectName}</h3>
          <p className="truncate text-[11px] text-ink-3">{context}</p>
        </div>
        <Badge tone={trend.side === "over" ? "positive" : "accent"}>
          {trend.side === "over" ? "Over" : "Under"} {trend.line}
        </Badge>
      </header>

      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold tracking-tight text-ink tabular">
            {trend.hits}
            <span className="text-base text-ink-3">/{trend.sample}</span>
          </div>
          <div className="text-xs text-ink-3">
            {trend.market} · {Math.round(rate * 100)}% hit rate
          </div>
        </div>
        <Sparkline values={trend.recent} reference={trend.line} className="h-9 w-28" label={`${trend.market} last ${trend.sample}`} />
      </div>

      <HitStrip values={trend.recent} line={trend.line} side={trend.side} />
    </article>
  );
}
