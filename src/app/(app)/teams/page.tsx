import type { Metadata } from "next";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { DemoDataBanner } from "@/components/ui/DemoDataBanner";
import { FreshnessIndicator } from "@/components/data/FreshnessIndicator";
import { TeamIntelligence } from "@/features/teams/TeamIntelligence";

export const metadata: Metadata = { title: "Team Intelligence" };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TeamsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const teamId = typeof params.team === "string" ? params.team : undefined;
  const [reference, forms, matches, props] = await Promise.all([api.getReferenceData(), api.getTeamForms(), api.getMatches(), api.getTeamProps()]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Team Intelligence"
        description="Form tables, scoring and conceding trends, home/away splits and team prop lines."
        eyebrow={
          <>
            <Badge tone="warning">Demo data</Badge>
            <FreshnessIndicator meta={forms.meta} label="Stats updated" thresholds={{ delayed: 7200, stale: 86400 }} />
          </>
        }
      />
      <DemoDataBanner />
      <TeamIntelligence key={teamId ?? "default"} reference={reference} forms={forms.data} matches={matches.data} teamProps={props.data} initialTeamId={teamId} />
    </div>
  );
}
