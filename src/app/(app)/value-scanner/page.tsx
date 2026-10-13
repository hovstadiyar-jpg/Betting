import type { Metadata } from "next";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { SourceBadge, SourceBanner } from "@/components/ui/SourceNotice";
import { FreshnessIndicator } from "@/components/data/FreshnessIndicator";
import { ValueScanner } from "@/features/value-scanner/ValueScanner";

export const metadata: Metadata = { title: "Value Scanner" };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ValueScannerPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const league = typeof params.league === "string" ? params.league : undefined;
  const [reference, matches, value] = await Promise.all([api.getReferenceData(), api.getMatches(), api.getValueOpportunities()]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Value Scanner"
        description="Every selection where the best available price is above the model's fair price. EV = model probability × best odds − 1."
        eyebrow={
          <>
            <SourceBadge metas={[value.meta, matches.meta]} />
            <FreshnessIndicator meta={value.meta} />
          </>
        }
      />
      <SourceBanner metas={[value.meta, matches.meta]} />
      <ValueScanner key={league ?? "all"} opportunities={value.data} matches={matches.data} reference={reference} initialLeague={league} />
    </div>
  );
}
