import type { Metadata } from "next";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { DemoDataBanner } from "@/components/ui/DemoDataBanner";
import { FreshnessIndicator } from "@/components/data/FreshnessIndicator";
import { MatchAnalyzer } from "@/features/match-analyzer/MatchAnalyzer";

export const metadata: Metadata = { title: "Match Analyzer" };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function MatchAnalyzerPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const matchId = typeof params.match === "string" ? params.match : undefined;
  const [reference, matches, markets, value, forms, props] = await Promise.all([
    api.getReferenceData(),
    api.getMatches(),
    api.getMarkets(),
    api.getValueOpportunities(),
    api.getTeamForms(),
    api.getPlayerProps(),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Match Analyzer"
        description="One fixture, every angle: model vs market probabilities, full odds comparison, form and the props worth a closer look."
        eyebrow={
          <>
            <Badge tone="warning">Demo data</Badge>
            <FreshnessIndicator meta={markets.meta} />
          </>
        }
      />
      <DemoDataBanner />
      <MatchAnalyzer
        key={matchId ?? "default"}
        reference={reference}
        matches={matches.data}
        markets={markets.data}
        opportunities={value.data}
        teamForms={forms.data}
        playerProps={props.data}
        initialMatchId={matchId}
      />
    </div>
  );
}
