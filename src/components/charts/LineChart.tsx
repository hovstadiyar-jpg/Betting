"use client";

import { useId, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils/cn";
import { extent, linearScale, niceTicks } from "./scale";
import { useElementWidth } from "./useElementWidth";

export interface LineSeries {
  id: string;
  label: string;
  values: number[];
  /** Categorical slot 1–4 (fixed order; never cycled). */
  slot?: 1 | 2 | 3 | 4;
}

interface LineChartProps {
  series: LineSeries[];
  xLabels: string[];
  height?: number;
  formatY?: (v: number) => string;
  /** Horizontal reference lines (e.g. break-even, opening price). */
  references?: Array<{ value: number; label: string }>;
  /** Shade the area under the first series. */
  area?: boolean;
  ariaLabel: string;
  className?: string;
  /** Include zero in the y-domain. */
  zeroBased?: boolean;
}

const MARGIN = { top: 12, right: 16, bottom: 26, left: 48 };
const seriesColor = (slot = 1) => `var(--color-series-${slot})`;

/**
 * Multi-series line chart with crosshair + tooltip (pointer and keyboard).
 * One y-axis only; series must share a unit.
 */
export function LineChart({
  series,
  xLabels,
  height = 220,
  formatY = (v) => v.toFixed(2),
  references = [],
  area = false,
  ariaLabel,
  className,
  zeroBased = false,
}: LineChartProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const gradientId = useId();

  const n = Math.max(...series.map((s) => s.values.length), 1);
  const all = [...series.flatMap((s) => s.values), ...references.map((r) => r.value), ...(zeroBased ? [0] : [])];
  const [lo, hi] = extent(all);
  const padY = (hi - lo) * 0.08 || 0.5;
  // Never pad below a zero baseline when every value is non-negative.
  const ticks = niceTicks(zeroBased && lo >= 0 ? 0 : lo - padY, hi + padY, 4);
  const yMin = ticks[0] ?? lo;
  const yMax = ticks[ticks.length - 1] ?? hi;

  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top - MARGIN.bottom;
  const x = linearScale([0, Math.max(1, n - 1)], [MARGIN.left, MARGIN.left + innerW]);
  const y = linearScale([yMin, yMax], [MARGIN.top + innerH, MARGIN.top]);

  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(innerW / 96))));

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - box.left;
    const idx = Math.round((px / box.width) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, idx)));
  };

  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === "ArrowRight") setHover((h) => Math.min(n - 1, (h ?? -1) + 1));
    else if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? n) - 1));
    else if (e.key === "Escape") setHover(null);
    else return;
    e.preventDefault();
  };

  const tooltipLeft = hover !== null ? x(hover) : 0;
  const flip = tooltipLeft > width * 0.6;

  return (
    <div className={cn("w-full", className)}>
      {series.length > 1 ? (
        <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2" aria-label="Legend">
          {series.map((s) => (
            <li key={s.id} className="flex items-center gap-1.5">
              <span aria-hidden className="h-0.5 w-3.5 rounded" style={{ background: seriesColor(s.slot) }} />
              {s.label}
            </li>
          ))}
        </ul>
      ) : null}
      <div ref={ref} className="relative w-full">
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          tabIndex={0}
          onKeyDown={onKey}
          onBlur={() => setHover(null)}
          className="block w-full select-none focus-visible:outline-offset-4"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={seriesColor(series[0]?.slot)} stopOpacity={0.14} />
              <stop offset="100%" stopColor={seriesColor(series[0]?.slot)} stopOpacity={0} />
            </linearGradient>
          </defs>

          {ticks.map((t) => (
            <g key={t}>
              <line x1={MARGIN.left} x2={MARGIN.left + innerW} y1={y(t)} y2={y(t)} stroke="var(--color-grid)" strokeWidth={1} />
              <text x={MARGIN.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-3 text-[10px] tabular">
                {formatY(t)}
              </text>
            </g>
          ))}

          {xLabels.map((label, i) =>
            (i % labelEvery === 0 && n - 1 - i >= labelEvery * 0.75) || i === n - 1 ? (
              <text key={`${label}-${i}`} x={x(i)} y={height - 8} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="fill-ink-3 text-[10px] tabular">
                {label}
              </text>
            ) : null,
          )}

          {references.map((r) => (
            <g key={r.label}>
              <line x1={MARGIN.left} x2={MARGIN.left + innerW} y1={y(r.value)} y2={y(r.value)} stroke="var(--color-ink-3)" strokeWidth={1} strokeOpacity={0.6} />
              <text x={MARGIN.left + innerW} y={y(r.value) - 4} textAnchor="end" className="fill-ink-3 text-[10px]">
                {r.label}
              </text>
            </g>
          ))}

          {area && series[0] ? (
            <path
              d={`${series[0].values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join("")}L${x(series[0].values.length - 1)},${MARGIN.top + innerH}L${x(0)},${MARGIN.top + innerH}Z`}
              fill={`url(#${gradientId})`}
            />
          ) : null}

          {series.map((s) => (
            <path
              key={s.id}
              d={s.values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("")}
              fill="none"
              stroke={seriesColor(s.slot)}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {/* End markers */}
          {series.map((s) => {
            const last = s.values[s.values.length - 1];
            if (last === undefined) return null;
            return (
              <circle key={`${s.id}-end`} cx={x(s.values.length - 1)} cy={y(last)} r={4} fill={seriesColor(s.slot)} stroke="var(--color-surface)" strokeWidth={2} />
            );
          })}

          {hover !== null ? (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={MARGIN.top} y2={MARGIN.top + innerH} stroke="var(--color-ink-3)" strokeWidth={1} />
              {series.map((s) => {
                const v = s.values[hover];
                return v === undefined ? null : (
                  <circle key={s.id} cx={x(hover)} cy={y(v)} r={4} fill={seriesColor(s.slot)} stroke="var(--color-surface)" strokeWidth={2} />
                );
              })}
            </g>
          ) : null}

          <rect
            x={MARGIN.left}
            y={MARGIN.top}
            width={innerW}
            height={innerH}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>

        {hover !== null ? (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-36 rounded-md border border-line-strong bg-surface-2/95 px-2.5 py-2 text-xs shadow-lg shadow-black/40"
            style={flip ? { right: width - tooltipLeft + 12 } : { left: tooltipLeft + 12 }}
          >
            <div className="mb-1 text-[11px] text-ink-3">{xLabels[hover]}</div>
            {series.map((s) => {
              const v = s.values[hover];
              return v === undefined ? null : (
                <div key={s.id} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-ink-3">
                    <span aria-hidden className="h-0.5 w-3 rounded" style={{ background: seriesColor(s.slot) }} />
                    {s.label}
                  </span>
                  <span className="font-semibold text-ink tabular">{formatY(v)}</span>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
