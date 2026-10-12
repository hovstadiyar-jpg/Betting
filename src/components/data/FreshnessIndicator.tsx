"use client";

import { useEffect, useState } from "react";
import type { DatasetMeta } from "@/lib/domain/types";
import { cn } from "@/lib/utils/cn";
import { formatAge } from "@/lib/utils/format";

interface FreshnessIndicatorProps {
  meta: DatasetMeta;
  label?: string;
  /** Seconds after which data is "delayed" / "stale". */
  thresholds?: { delayed: number; stale: number };
  className?: string;
}

/**
 * Shows how old a dataset is, ticking forward in the browser.
 * Starts from the server-provided age so the first client render matches SSR.
 */
export function FreshnessIndicator({ meta, label = "Updated", thresholds = { delayed: 120, stale: 900 }, className }: FreshnessIndicatorProps) {
  const [age, setAge] = useState(meta.ageSeconds);

  useEffect(() => {
    const started = Date.now();
    const id = window.setInterval(() => {
      setAge(meta.ageSeconds + Math.floor((Date.now() - started) / 1000));
    }, 5000);
    return () => window.clearInterval(id);
  }, [meta.ageSeconds]);

  const state = age >= thresholds.stale ? "stale" : age >= thresholds.delayed ? "delayed" : "fresh";
  const dot = state === "fresh" ? "bg-pos" : state === "delayed" ? "bg-warn" : "bg-neg";
  const stateText = state === "fresh" ? "Fresh" : state === "delayed" ? "Delayed" : "Stale";

  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-[11px] text-ink-3", className)}
      title={`Dataset as of ${meta.asOf} · source: ${meta.source}`}
    >
      <span aria-hidden className="relative flex size-2">
        {state === "fresh" ? <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-40", dot)} /> : null}
        <span className={cn("relative inline-flex size-2 rounded-full", dot)} />
      </span>
      <span>
        <span className="sr-only">{stateText}. </span>
        {label} {formatAge(age)}
      </span>
      {meta.source === "synthetic" ? <span className="rounded bg-warn-soft px-1 text-[10px] font-semibold uppercase tracking-wide text-warn">Demo</span> : null}
    </span>
  );
}
