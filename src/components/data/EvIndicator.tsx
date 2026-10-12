import { cn } from "@/lib/utils/cn";
import { formatSignedPct } from "@/lib/utils/format";

interface EvIndicatorProps {
  /** Expected value as a fraction (0.042 = +4.2%). */
  ev: number;
  /** Show a small magnitude meter next to the figure. */
  meter?: boolean;
  /** EV at which the meter is full. */
  scale?: number;
  className?: string;
}

/**
 * Signed EV figure with an optional magnitude meter.
 * Sign is always printed, so meaning never depends on colour alone.
 */
export function EvIndicator({ ev, meter = true, scale = 0.1, className }: EvIndicatorProps) {
  const tone = ev >= 0.03 ? "text-pos" : ev > 0 ? "text-ink" : "text-neg";
  const fill = ev >= 0.03 ? "bg-pos" : ev > 0 ? "bg-accent" : "bg-neg";
  const pct = Math.min(100, (Math.abs(ev) / scale) * 100);

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className={cn("w-14 text-right font-mono text-[12.5px] font-semibold tabular", tone)}>{formatSignedPct(ev)}</span>
      {meter ? (
        <span aria-hidden className="h-1.5 w-12 overflow-hidden rounded-full bg-surface-3">
          <span className={cn("block h-full rounded-full", fill)} style={{ width: `${pct}%` }} />
        </span>
      ) : null}
    </span>
  );
}
