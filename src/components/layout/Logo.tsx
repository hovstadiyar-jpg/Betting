import { cn } from "@/lib/utils/cn";

/** Wordmark: a rising price line inside a square mark. */
export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg viewBox="0 0 24 24" aria-hidden className="size-6 shrink-0">
        <rect x="0.5" y="0.5" width="23" height="23" rx="5" fill="var(--color-surface-3)" stroke="var(--color-line-strong)" />
        <path d="M5 16.5 9.5 12l3 2.5L19 7.5" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="19" cy="7.5" r="1.6" fill="var(--color-pos)" />
      </svg>
      {compact ? null : (
        <span className="text-[15px] font-semibold tracking-tight text-ink">
          Betting<span className="text-accent">Value</span>
        </span>
      )}
    </span>
  );
}
