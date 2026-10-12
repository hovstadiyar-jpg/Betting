import { cn } from "@/lib/utils/cn";
import { extent, linearScale } from "./scale";

interface SparklineProps {
  values: number[];
  className?: string;
  /** Accessible description. */
  label: string;
  /** Optional horizontal reference (e.g. a prop line). */
  reference?: number;
  tone?: "accent" | "positive" | "negative" | "muted";
}

const STROKES = {
  accent: "var(--color-series-1)",
  positive: "var(--color-pos)",
  negative: "var(--color-neg)",
  muted: "var(--color-ink-3)",
};

/** Minimal inline trend line. Uses a fixed viewBox; it has no text, so scaling is safe. */
export function Sparkline({ values, className, label, reference, tone = "accent" }: SparklineProps) {
  const W = 100;
  const H = 32;
  const pad = 3;
  const [lo, hi] = extent(reference !== undefined ? [...values, reference] : values);
  const x = linearScale([0, Math.max(1, values.length - 1)], [pad, W - pad]);
  const y = linearScale([lo, hi], [H - pad, pad]);
  const d = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join("");
  const last = values[values.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label} className={cn("overflow-visible", className)}>
      {reference !== undefined ? (
        <line x1={0} x2={W} y1={y(reference)} y2={y(reference)} stroke="var(--color-line-strong)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      ) : null}
      <path d={d} fill="none" stroke={STROKES[tone]} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {last !== undefined ? (
        <circle cx={x(values.length - 1)} cy={y(last)} r={2.2} fill={STROKES[tone]} vectorEffect="non-scaling-stroke" />
      ) : null}
    </svg>
  );
}
