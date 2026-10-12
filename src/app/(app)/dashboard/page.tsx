import type { Metadata } from "next";
import Link from "next/link";
import { Activity, ArrowRight, Gauge, Layers, Radar, Target, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import { summarizeMatches } from "@/lib/domain/markets";
import { createLookup } from "@/lib/domain/lookup";
import { formatShortDate, formatSignedPct, formatTime } from "@/lib/utils/format";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatTile } from "@/components/ui/StatTile";
import { DemoDataBanner } from "@/components/ui/DemoDataBanner";
import { FreshnessIndicator } from "@/components/data/FreshnessIndicator";
import { MatchTable } from "@/components/data/MatchTable";
import { ValueTable } from "@/components/data/ValueTable";
import { OddsComparisonTable } from "@/components/data/OddsComparisonTable";
import { TrendCard } from "@/components/data/TrendCard";
import { BarChart } from "@/components/charts/BarChart";
import { LineChart } from "@/components/charts/LineChart";

export const metadata: Metadata = { title: "Dashboard" };

const EV_BUCKETS = [
  { label: "0–1%", min: 0, max: 0.01 },
  { label: "1–2%", min: 0.01, max: 0.02 },
  { label: "2–3%", min: 0.02, max: 0.03 },
  { label: "3–5%", min: 0.03, max: 0.05 },
  { label: "5–8%", min: 0.05, max: 0.08 },
  { label: "8%+", min: 0.08, max: Infinity },
];

function opportunityDelta(trend: number[]) {
  const diff = (trend[trend.length - 1] ?? 0) - (trend[trend.length - 2] ?? 0);
  return {
    value: `${diff > 0 ? "+" : ""}${diff}`,
    direction: diff > 0 ? ("up" as const) : diff < 0 ? ("down" as const) : ("flat" as const),
    good: diff > 0,
    caption: "vs 1h ago",
  };
}

export default async function DashboardPage() {
  const [reference, summary, matches, markets, value, trends, movements] = await Promise.all([
    api.getReferenceData(),
    api.getDashboardSummary(),
    api.getMatches(),
    api.getMarkets(),
    api.getValueOpportunities(),
    api.getTrends(),
    api.getLineMovements(),
  ]);

  const lookup = createLookup(reference);
  const s = summary.data;
  const summaries = summarizeMatches(matches.data, markets.data, value.data);

  const featuredMatch = matches.data.find((m) => m.status === "scheduled" && m.sportId === "football") ?? matches.data[0];
  const featuredMarket = markets.data.find((m) => m.matchId === featuredMatch?.id);
  const steam = movements.data.find((m) => m.category === "match" && m.steam) ?? movements.data[0];
  const evHistogram = EV_BUCKETS.map((b) => ({
    label: b.label,
    value: value.data.filter((v) => v.ev > b.min && v.ev <= b.max).length,
  }));
  const topTrends = trends.data.filter((t) => t.kind === "player").slice(0, 3);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Market overview"
        description="Where model prices and bookmaker prices disagree right now, across every tracked league."
        eyebrow={
          <>
            <Badge tone="warning">Demo data</Badge>
            <FreshnessIndicator meta={summary.meta} />
          </>
        }
        actions={
          <Link href="/value-scanner" className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent-strong px-3 text-xs font-medium text-white hover:bg-accent">
            Open Value Scanner <ArrowRight className="size-3.5" />
          </Link>
        }
      />

      <DemoDataBanner />

      <section aria-label="Key metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Value opportunities"
          value={s.valueBetsCount}
          icon={<Radar className="size-4" />}
          trend={s.opportunitiesTrend}
          delta={opportunityDelta(s.opportunitiesTrend)}
        />
        <StatTile label="Average EV" value={formatSignedPct(s.averageEv)} icon={<Gauge className="size-4" />} hint={`Top opportunity ${formatSignedPct(s.topEv)}`} />
        <StatTile
          label="Markets tracked"
          value={markets.data.length}
          icon={<Layers className="size-4" />}
          hint={`${s.matchesTracked} fixtures · ${s.bookmakersTracked} books`}
        />
        <StatTile
          label="Props tracked"
          value={s.propsTracked}
          icon={<Target className="size-4" />}
          hint={`Model Brier score ${s.modelBrierScore.toFixed(3)}`}
        />
      </section>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Top value opportunities"
            subtitle="Best available price vs model fair price, sorted by expected value"
            icon={<TrendingUp className="size-4" />}
            actions={
              <Link href="/value-scanner" className="text-xs text-accent hover:underline">
                View all
              </Link>
            }
          />
          <ValueTable rows={value.data} matches={matches.data} reference={reference} maxRows={8} compact />
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="EV distribution" subtitle="Count of opportunities by EV band" />
            <CardBody>
              <BarChart data={evHistogram} height={180} showValues ariaLabel="Histogram of value opportunities by expected value band" />
            </CardBody>
          </Card>

          {steam ? (
            <Card>
              <CardHeader
                title="Sharpest line move"
                subtitle={`${steam.marketName} · ${steam.selectionLabel}`}
                icon={<Activity className="size-4" />}
                actions={steam.steam ? <Badge tone="warning">Steam</Badge> : null}
              />
              <CardBody>
                <LineChart
                  series={[{ id: "odds", label: steam.selectionLabel, values: steam.history.map((p) => p.odds) }]}
                  xLabels={steam.history.map((p) => `${formatShortDate(p.t)} ${formatTime(p.t)}`)}
                  references={[{ value: steam.openingOdds, label: "Open" }]}
                  height={170}
                  area
                  ariaLabel={`Price history for ${steam.selectionLabel}`}
                />
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Upcoming fixtures"
            subtitle="Best price per outcome across tracked books"
            actions={<FreshnessIndicator meta={matches.meta} />}
          />
          <MatchTable matches={matches.data} reference={reference} summaries={summaries} maxRows={9} dense />
        </Card>

        <section aria-labelledby="trends-heading" className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 id="trends-heading" className="text-[13px] font-semibold text-ink">
              Statistical trends
            </h2>
            <Link href="/props-lab" className="text-xs text-accent hover:underline">
              Trend Explorer
            </Link>
          </div>
          {topTrends.map((t) => {
            const player = lookup.player(t.subjectId);
            return (
              <TrendCard
                key={t.id}
                trend={t}
                subjectName={player?.name ?? t.subjectId}
                context={`${player ? lookup.teamName(player.teamId) : ""} · ${lookup.leagueName(t.leagueId)}`}
              />
            );
          })}
        </section>
      </div>

      {featuredMatch && featuredMarket ? (
        <Card>
          <CardHeader
            title="Odds comparison"
            subtitle={`${lookup.teamName(featuredMatch.homeTeamId)} v ${lookup.teamName(featuredMatch.awayTeamId)} · ${featuredMarket.name} · ▲ marks the best price`}
            actions={
              <Link href={`/match-analyzer?match=${featuredMatch.id}`} className="text-xs text-accent hover:underline">
                Full match analysis
              </Link>
            }
          />
          <OddsComparisonTable market={featuredMarket} bookmakers={reference.bookmakers} />
        </Card>
      ) : null}
    </div>
  );
}
