import type { Metadata } from "next";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { DemoDataBanner } from "@/components/ui/DemoDataBanner";
import { FreshnessIndicator } from "@/components/data/FreshnessIndicator";
import { PropsLab } from "@/features/props-lab/PropsLab";

export const metadata: Metadata = { title: "Bet365 Props Lab" };

export default async function PropsLabPage() {
  const [reference, playerProps, teamProps, trends, matchups, movements] = await Promise.all([
    api.getReferenceData(),
    api.getPlayerProps(),
    api.getTeamProps(),
    api.getTrends(),
    api.getMatchups(),
    api.getLineMovements(),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bet365 Props Lab"
        description="A dedicated workspace for player and team prop research: lines, projections, hit rates, matchups and line movement."
        eyebrow={
          <>
            <Badge tone="warning">Demo data · not connected to Bet365</Badge>
            <FreshnessIndicator meta={playerProps.meta} label="Props updated" />
          </>
        }
      />

      <DemoDataBanner>
        BettingValue is not affiliated with Bet365, and <strong className="font-semibold text-ink">no Bet365 data feed is connected</strong>. Every line, price,
        projection and statistic in this lab is randomly generated to demonstrate the interface. Any future integration would require a licensed data source.
      </DemoDataBanner>

      <PropsLab
        reference={reference}
        playerProps={playerProps.data}
        teamProps={teamProps.data}
        trends={trends.data}
        matchups={matchups.data}
        movements={movements.data.filter((m) => m.category !== "match")}
      />
    </div>
  );
}
