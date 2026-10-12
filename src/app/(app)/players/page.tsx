import type { Metadata } from "next";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { DemoDataBanner } from "@/components/ui/DemoDataBanner";
import { FreshnessIndicator } from "@/components/data/FreshnessIndicator";
import { PlayerIntelligence } from "@/features/players/PlayerIntelligence";

export const metadata: Metadata = { title: "Player Intelligence" };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PlayersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const playerId = typeof params.player === "string" ? params.player : undefined;
  const [reference, profiles, props] = await Promise.all([api.getReferenceData(), api.getPlayerProfiles(), api.getPlayerProps()]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Player Intelligence"
        description="Season averages, game logs against upcoming lines, availability and every prop on the board for a player."
        eyebrow={
          <>
            <Badge tone="warning">Demo data</Badge>
            <FreshnessIndicator meta={profiles.meta} label="Stats updated" thresholds={{ delayed: 7200, stale: 86400 }} />
          </>
        }
      />
      <DemoDataBanner />
      <PlayerIntelligence key={playerId ?? "default"} reference={reference} profiles={profiles.data} playerProps={props.data} initialPlayerId={playerId} />
    </div>
  );
}
