import type { Metadata } from "next";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { SourceBadge, SourceBanner } from "@/components/ui/SourceNotice";
import { FreshnessIndicator } from "@/components/data/FreshnessIndicator";
import { OddsMovementExplorer } from "@/features/odds-movement/OddsMovementExplorer";

export const metadata: Metadata = { title: "Odds Movement" };

export default async function OddsMovementPage() {
  const [reference, movements, matches] = await Promise.all([api.getReferenceData(), api.getLineMovements(), api.getMatches()]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Odds Movement"
        description="How prices have moved over the last 48 hours: shortening, drifting and sharp steam moves across markets and props."
        eyebrow={
          <>
            <SourceBadge metas={[movements.meta, matches.meta]} />
            <FreshnessIndicator meta={movements.meta} />
          </>
        }
      />
      <SourceBanner metas={[movements.meta, matches.meta]} />
      <OddsMovementExplorer movements={movements.data} matches={matches.data} reference={reference} />
    </div>
  );
}
