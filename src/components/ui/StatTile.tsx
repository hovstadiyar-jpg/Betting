import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { Sparkline } from "@/components/charts/Sparkline";

interface StatTileProps {
  label: string;
  value: ReactNode;
  delta?: { value: string; direction: "up" | "down" | "flat"; good?: boolean; caption?: string };
  trend?: number[];
  /** Neutral secondary line under the value (use instead of a delta when nothing changed). */
  hint?: ReactNode;
  icon?: ReactNode;
  className?: string;
  valueClassName?: string;
}

export function StatTile({ label, value, delta, trend, hint, icon, className, valueClassName }: StatTileProps) {
  const deltaColor = !delta || delta.direction === "flat" ? "text-ink-3" : delta.good ? "text-pos" : "text-neg";
  return (
    <div className={cn("flex flex-col justify-between gap-3 rounded-lg border border-line bg-surface p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-ink-3">{label}</span>
        {icon ? <span className="text-ink-3">{icon}</span> : null}
      </div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className={cn("text-2xl font-semibold tracking-tight", valueClassName ?? "text-ink")}>{value}</div>
          {delta ? (
            <div className={cn("mt-1 text-xs", deltaColor)}>
              {delta.direction === "up" ? "▲" : delta.direction === "down" ? "▼" : "■"} {delta.value}
              {delta.caption ? <span className="ml-1 text-ink-3">{delta.caption}</span> : null}
            </div>
          ) : null}
          {hint ? <div className="mt-1 text-xs text-ink-3">{hint}</div> : null}
        </div>
        {trend && trend.length > 1 ? <Sparkline values={trend} className="h-8 w-24" label={`${label} trend`} /> : null}
      </div>
    </div>
  );
}
