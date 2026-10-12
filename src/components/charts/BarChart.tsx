"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { linearScale, niceTicks, roundedBarPath } from "./scale";
import { useElementWidth } from "./useElementWidth";

export interface BarDatum {
  label: string;
  value: number;
}

interface BarChartProps {
  data: BarDatum[];
  height?: number;
  /** Prop line: bars above it are "over" (positive tone), below are "under". */
  threshold?: number;
  thresholdLabel?: string;
  /** Diverging mode: colour by sign around zero (e.g. monthly P/L). */
  signed?: boolean;
  formatValue?: (v: number) => string;
  /** Print values on bar caps (only for short series). */
  showValues?: boolean;
  ariaLabel: string;
  className?: string;
  legend?: { above: string; below: string };
}

const MARGIN = { top: 16, right: 12, bottom: 24, left: 40 };

/**
 * Column chart for game logs (with a prop-line threshold) and signed P/L series.
 * Bars ≤ 24px thick, 4px rounded data-end, per-bar hover/focus tooltip.
 */
export function BarChart({
  data,
  height = 200,
  threshold,
  thresholdLabel,
  signed = false,
  formatValue = (v) => `${v}`,
  showValues = false,
  ariaLabel,
  className,
  legend,
}: BarChartProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const values = data.map((d) => d.value);
  const lo = Math.min(0, ...values, threshold ?? 0);
  const hi = Math.max(0, ...values, threshold ?? 0);
  const ticks = niceTicks(lo, hi === lo ? lo + 1 : hi, 4);
  const yMin = ticks[0] ?? lo;
  const yMax = ticks[ticks.length - 1] ?? hi;

  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top - MARGIN.bottom;
  const y = linearScale([yMin, yMax], [MARGIN.top + innerH, MARGIN.top]);
  const band = innerW / Math.max(1, data.length);
  const barW = Math.max(3, Math.min(24, band - 4));
  const zeroY = y(0);

  const colorFor = (v: number) => {
    if (signed) return v >= 0 ? "var(--color-pos)" : "var(--color-neg)";
    if (threshold !== undefined) return v > threshold ? "var(--color-pos)" : "var(--color-ink-3)";
    return "var(--color-series-1)";
  };

  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(innerW / 44))));
  const activeDatum = active !== null ? data[active] : undefined;

  return (
    <div className={cn("w-full", className)}>
      {legend ? (
        <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2" aria-label="Legend">
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm bg-pos" />
            {legend.above}
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className={cn("size-2.5 rounded-sm", signed ? "bg-neg" : "bg-ink-3")} />
            {legend.below}
          </li>
        </ul>
      ) : null}
      <div ref={ref} className="relative w-full">
        <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block w-full select-none">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={MARGIN.left} x2={MARGIN.left + innerW} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--color-axis)" : "var(--color-grid)"} strokeWidth={1} />
              <text x={MARGIN.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-3 text-[10px] tabular">
                {formatValue(t)}
              </text>
            </g>
          ))}

          {data.map((d, i) => {
            const cx = MARGIN.left + band * i + band / 2;
            const top = Math.min(y(d.value), zeroY);
            const h = Math.abs(y(d.value) - zeroY);
            const negative = d.value < 0;
            return (
              <g key={`${d.label}-${i}`}>
                <path
                  d={roundedBarPath(cx - barW / 2, top, barW, Math.max(h, d.value === 0 ? 0 : 1), 4, negative)}
                  fill={colorFor(d.value)}
                  opacity={active === null || active === i ? 1 : 0.55}
                />
                {showValues && h > 0 ? (
                  <text x={cx} y={negative ? top + h + 11 : top - 4} textAnchor="middle" className="fill-ink-2 text-[10px] tabular">
                    {formatValue(d.value)}
                  </text>
                ) : null}
                {i % labelEvery === 0 && (i === data.length - 1 || data.length - 1 - i >= labelEvery * 0.75 || labelEvery === 1) ? (
                  <text x={cx} y={height - 8} textAnchor="middle" className="fill-ink-3 text-[10px]">
                    {d.label}
                  </text>
                ) : null}
                {/* Hit target: full band height, wider than the bar */}
                <rect
                  x={MARGIN.left + band * i}
                  y={MARGIN.top}
                  width={band}
                  height={innerH}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${d.label}: ${formatValue(d.value)}`}
                  onPointerEnter={() => setActive(i)}
                  onPointerLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  className="outline-none"
                />
              </g>
            );
          })}

          {threshold !== undefined ? (
            <g pointerEvents="none">
              <line x1={MARGIN.left} x2={MARGIN.left + innerW} y1={y(threshold)} y2={y(threshold)} stroke="var(--color-warn)" strokeWidth={1.5} />
              {thresholdLabel ? (
                <text x={MARGIN.left + innerW} y={y(threshold) - 5} textAnchor="end" className="fill-ink-2 text-[10px] font-medium">
                  {thresholdLabel}
                </text>
              ) : null}
            </g>
          ) : null}
        </svg>

        {activeDatum && active !== null ? (
          <div
            className="pointer-events-none absolute top-1 z-10 rounded-md border border-line-strong bg-surface-2/95 px-2.5 py-1.5 text-xs shadow-lg shadow-black/40"
            style={{ left: Math.min(width - 120, Math.max(0, MARGIN.left + band * active + band / 2 - 50)) }}
          >
            <div className="font-semibold text-ink tabular">{formatValue(activeDatum.value)}</div>
            <div className="text-[11px] text-ink-3">{activeDatum.label}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
