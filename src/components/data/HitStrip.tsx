import { cn } from "@/lib/utils/cn";

interface HitStripProps {
  values: number[];
  line: number;
  side?: "over" | "under";
  className?: string;
}

/**
 * Recent-game hit/miss strip (oldest → newest). Each cell prints the value,
 * so hit/miss is legible without relying on colour.
 */
export function HitStrip({ values, line, side = "over", className }: HitStripProps) {
  return (
    <span className={cn("inline-flex gap-0.5", className)} aria-label={`Last ${values.length}: ${values.join(", ")} vs line ${line}`}>
      {values.map((v, i) => {
        const hit = side === "over" ? v > line : v < line;
        return (
          <span
            key={i}
            className={cn(
              "flex h-5 min-w-5 items-center justify-center rounded-[3px] px-0.5 font-mono text-[10px] tabular",
              hit ? "bg-pos/20 text-pos" : "bg-surface-3 text-ink-3",
            )}
          >
            {v}
          </span>
        );
      })}
    </span>
  );
}

/** Hit rate figure, coloured by strength and always printed as a percentage. */
export function HitRate({ rate, className }: { rate: number; className?: string }) {
  const tone = rate >= 0.7 ? "text-pos" : rate <= 0.3 ? "text-neg" : "text-ink-2";
  return <span className={cn("font-mono text-[12.5px] tabular", tone, className)}>{Math.round(rate * 100)}%</span>;
}

/** W/D/L form chips. */
export function FormChips({ results }: { results: Array<"W" | "D" | "L"> }) {
  return (
    <span className="inline-flex gap-0.5">
      {results.map((r, i) => (
        <span
          key={i}
          className={cn(
            "flex size-5 items-center justify-center rounded-[3px] text-[10px] font-semibold",
            r === "W" ? "bg-pos/20 text-pos" : r === "L" ? "bg-neg/20 text-neg" : "bg-surface-3 text-ink-2",
          )}
        >
          {r}
        </span>
      ))}
    </span>
  );
}
