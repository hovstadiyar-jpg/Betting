"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import type { Market, Match, PlayerProp, TeamForm, ValueOpportunity } from "@/lib/domain/types";
import { createLookup, type ReferenceLike } from "@/lib/domain/lookup";
import { noVigProbabilities } from "@/lib/domain/odds";
import { bestQuote } from "@/lib/domain/markets";
import { formatKickoff, formatOdds, formatPct } from "@/lib/utils/format";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Field, Select } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { OddsComparisonTable } from "@/components/data/OddsComparisonTable";
import { EvIndicator } from "@/components/data/EvIndicator";
import { FormChips, HitRate } from "@/components/data/HitStrip";
import { LineChart } from "@/components/charts/LineChart";

interface MatchAnalyzerProps {
  reference: ReferenceLike;
  matches: Match[];
  markets: Market[];
  opportunities: ValueOpportunity[];
  teamForms: TeamForm[];
  playerProps: PlayerProp[];
  initialMatchId?: string;
}

const SLOT_BG = ["bg-series-1", "bg-series-2", "bg-series-3"];

/** Stacked probability bar with a legend; identity never relies on colour alone. */
function ProbabilityBar({ parts }: { parts: Array<{ label: string; p: number }> }) {
  return (
    <div>
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={parts.map((x) => `${x.label} ${formatPct(x.p)}`).join(", ")}>
        {parts.map((x, i) => (
          <div key={x.label} className={SLOT_BG[i]} style={{ width: `${x.p * 100}%` }} />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
        {parts.map((x, i) => (
          <li key={x.label} className="flex items-center gap-1.5 text-ink-2">
            <span aria-hidden className={`size-2.5 rounded-sm ${SLOT_BG[i]}`} />
            {x.label} <span className="font-mono font-semibold tabular text-ink">{formatPct(x.p)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FormRow({ label, home, away }: { label: string; home: React.ReactNode; away: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-line/70 py-2 text-[13px] last:border-0">
      <div className="text-left">{home}</div>
      <div className="text-center text-[11px] uppercase tracking-wider text-ink-3">{label}</div>
      <div className="text-right">{away}</div>
    </div>
  );
}

export function MatchAnalyzer({ reference, matches, markets, opportunities, teamForms, playerProps, initialMatchId }: MatchAnalyzerProps) {
  const lookup = useMemo(() => createLookup(reference), [reference]);
  const [matchId, setMatchId] = useState(() => (matches.some((m) => m.id === initialMatchId) ? initialMatchId : matches[0]?.id) ?? "");

  const match = matches.find((m) => m.id === matchId);
  const matchMarkets = useMemo(() => markets.filter((m) => m.matchId === matchId), [markets, matchId]);
  const matchValue = useMemo(() => opportunities.filter((o) => o.matchId === matchId).sort((a, b) => b.ev - a.ev), [opportunities, matchId]);
  const props = useMemo(() => playerProps.filter((p) => p.matchId === matchId).sort((a, b) => b.ev - a.ev).slice(0, 8), [playerProps, matchId]);
  const formById = useMemo(() => new Map(teamForms.map((f) => [f.teamId, f])), [teamForms]);

  const select = (id: string) => {
    setMatchId(id);
    window.history.replaceState(null, "", `/match-analyzer?match=${id}`);
  };

  if (!match) return <EmptyState title="No fixtures available" />;

  const primary = matchMarkets[0];
  const modelParts = primary?.selections.map((s) => ({ label: s.label, p: s.modelProbability })) ?? [];
  const modelTotal = modelParts.reduce((a, b) => a + b.p, 0) || 1;
  const bestPrices = primary?.selections.map((s) => bestQuote(s.quotes)?.odds ?? 0) ?? [];
  const marketParts = primary
    ? noVigProbabilities(bestPrices.filter((o) => o > 0)).map((p, i) => ({ label: primary.selections[i]?.label ?? "", p }))
    : [];

  const home = formById.get(match.homeTeamId);
  const away = formById.get(match.awayTeamId);
  const perGame = (f?: TeamForm, key: "scored" | "conceded" = "scored") => (f ? (f[key] / f.played).toFixed(match.sportId === "basketball" ? 1 : 2) : "—");

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <Field label="Fixture" htmlFor="match-select" className="max-w-xl">
          <Select
            id="match-select"
            value={matchId}
            onValueChange={select}
            options={matches.map((m) => ({
              value: m.id,
              label: `${lookup.teamName(m.homeTeamId)} v ${lookup.teamName(m.awayTeamId)} — ${lookup.leagueName(m.leagueId)} · ${m.status === "live" ? "LIVE" : formatKickoff(m.kickoff)}`,
            }))}
          />
        </Field>
      </Card>

      <Card>
        <CardBody className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
            <Badge tone="outline">{lookup.leagueName(match.leagueId)}</Badge>
            {match.status === "live" ? <Badge tone="negative">Live</Badge> : null}
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-3.5" /> {formatKickoff(match.kickoff)} UTC
            </span>
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            <div>
              <div className="text-lg font-semibold text-ink sm:text-2xl">{lookup.teamName(match.homeTeamId)}</div>
              <div className="mt-1">{home ? <FormChips results={home.lastFive} /> : null}</div>
            </div>
            <div className="text-sm text-ink-3">vs</div>
            <div className="text-right">
              <div className="text-lg font-semibold text-ink sm:text-2xl">{lookup.teamName(match.awayTeamId)}</div>
              <div className="mt-1 flex justify-end">{away ? <FormChips results={away.lastFive} /> : null}</div>
            </div>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-ink-3">Model probability</div>
              <ProbabilityBar parts={modelParts.map((x) => ({ ...x, p: x.p / modelTotal }))} />
            </div>
            <div>
              <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-ink-3">Market (no-vig, best prices)</div>
              <ProbabilityBar parts={marketParts} />
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          {matchMarkets.map((m) => (
            <Card key={m.id}>
              <CardHeader title={m.name} subtitle="▲ marks the best price per selection" />
              <OddsComparisonTable market={m} bookmakers={reference.bookmakers} />
            </Card>
          ))}

          {home && away ? (
            <Card>
              <CardHeader title={match.sportId === "basketball" ? "Points scored — last 10" : "Goals scored — last 10"} subtitle="Per game, oldest to newest" />
              <CardBody>
                <LineChart
                  series={[
                    { id: "home", label: lookup.teamName(match.homeTeamId), values: home.scoringTrend, slot: 1 },
                    { id: "away", label: lookup.teamName(match.awayTeamId), values: away.scoringTrend, slot: 2 },
                  ]}
                  xLabels={home.scoringTrend.map((_, i) => `G${i + 1}`)}
                  formatY={(v) => (match.sportId === "basketball" ? v.toFixed(0) : v.toFixed(1))}
                  zeroBased={match.sportId !== "basketball"}
                  height={200}
                  ariaLabel="Scoring trend comparison"
                />
              </CardBody>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Value on this fixture" subtitle={`${matchValue.length} selection${matchValue.length === 1 ? "" : "s"} above fair price`} />
            {matchValue.length === 0 ? (
              <EmptyState title="No value flagged" message="No selection's best price beats the model's fair price." />
            ) : (
              <ul>
                {matchValue.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-3 border-b border-line/70 px-4 py-2.5 last:border-0">
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-medium text-ink">{v.selectionLabel}</div>
                      <div className="text-[11px] text-ink-3">
                        {v.marketName} · {formatOdds(v.bestOdds)} @ {lookup.bookmakerName(v.bestBookmakerId)}
                      </div>
                    </div>
                    <EvIndicator ev={v.ev} meter={false} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Form comparison" subtitle="Last 10 games" />
            <CardBody className="py-2">
              <FormRow label="W-D-L" home={home ? `${home.wins}-${home.draws}-${home.losses}` : "—"} away={away ? `${away.wins}-${away.draws}-${away.losses}` : "—"} />
              <FormRow label="Scored / g" home={<span className="font-mono tabular">{perGame(home)}</span>} away={<span className="font-mono tabular">{perGame(away)}</span>} />
              <FormRow
                label="Conceded / g"
                home={<span className="font-mono tabular">{perGame(home, "conceded")}</span>}
                away={<span className="font-mono tabular">{perGame(away, "conceded")}</span>}
              />
              <FormRow label="Home rec." home={home?.homeRecord ?? "—"} away={away?.homeRecord ?? "—"} />
              <FormRow label="Away rec." home={home?.awayRecord ?? "—"} away={away?.awayRecord ?? "—"} />
              {home?.xgFor !== undefined ? (
                <FormRow label="xG for" home={<span className="font-mono tabular">{home.xgFor.toFixed(2)}</span>} away={<span className="font-mono tabular">{away?.xgFor?.toFixed(2) ?? "—"}</span>} />
              ) : null}
              {home?.pace !== undefined ? (
                <FormRow label="Pace" home={<span className="font-mono tabular">{home.pace.toFixed(1)}</span>} away={<span className="font-mono tabular">{away?.pace?.toFixed(1) ?? "—"}</span>} />
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Top player props"
              subtitle="Highest model EV in this fixture"
              actions={
                <Link href="/props-lab" className="text-xs text-accent hover:underline">
                  Props Lab
                </Link>
              }
            />
            <ul>
              {props.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 border-b border-line/70 px-4 py-2 last:border-0">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] text-ink">{lookup.playerName(p.playerId)}</div>
                    <div className="text-[11px] text-ink-3">
                      {p.bestSide === "over" ? "Over" : "Under"} {p.line} {p.market} · L10 <HitRate rate={p.hitRateL10} className="text-[11px]" />
                    </div>
                  </div>
                  <EvIndicator ev={p.ev} meter={false} />
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
