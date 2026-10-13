import type { ReactNode } from "react";
import { Radio } from "lucide-react";
import type { DatasetMeta } from "@/lib/domain/types";
import { Badge } from "./Badge";
import { DemoDataBanner } from "./DemoDataBanner";

const anySynthetic = (metas: DatasetMeta[]) => metas.some((m) => m.source === "synthetic");

/** "Demo data" when any dataset on the page is synthetic, otherwise "Live odds". */
export function SourceBadge({ metas }: { metas: DatasetMeta[] }) {
  return anySynthetic(metas) ? <Badge tone="warning">Demo data</Badge> : <Badge tone="positive">Live odds</Badge>;
}

/**
 * Page-level disclosure. Shows the synthetic-data banner whenever any dataset is synthetic;
 * otherwise a short note about live odds and their limits.
 */
export function SourceBanner({ metas, demoText }: { metas: DatasetMeta[]; demoText?: ReactNode }) {
  if (anySynthetic(metas)) return <DemoDataBanner>{demoText}</DemoDataBanner>;
  return (
    <div role="note" className="flex items-start gap-2.5 rounded-md border border-line bg-surface px-3 py-2 text-xs leading-5 text-ink-2">
      <Radio aria-hidden className="mt-0.5 size-3.5 shrink-0 text-pos" />
      <p>
        <span className="font-semibold text-ink">Live odds from a licensed data provider.</span> Prices can change or be withdrawn at any time.
        Always confirm with the bookmaker. Fair prices are a no-vig consensus across bookmakers. Informational analytics only, not betting advice.
      </p>
    </div>
  );
}
