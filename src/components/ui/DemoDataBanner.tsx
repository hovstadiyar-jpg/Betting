import type { ReactNode } from "react";
import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Mandatory disclosure shown on every data page in Phase 1.
 * All figures are synthetic; no bookmaker or data feed is connected.
 */
export function DemoDataBanner({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-2.5 rounded-md border border-warn/25 bg-warn-soft px-3 py-2 text-xs leading-5 text-ink-2",
        className,
      )}
    >
      <FlaskConical aria-hidden className="mt-0.5 size-3.5 shrink-0 text-warn" />
      <p>
        <span className="font-semibold text-warn">Synthetic demonstration data.</span>{" "}
        {children ??
          "All fixtures, teams, players, prices and statistics on this page are randomly generated for product demonstration. No bookmaker or sports data feed is connected."}
      </p>
    </div>
  );
}
