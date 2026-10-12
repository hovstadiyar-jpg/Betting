"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Match, TeamForm, TeamProp } from "@/lib/domain/types";
import { createLookup, type ReferenceLike } from "@/lib/domain/lookup";
import { formatKickoff, formatOdds } from "@/lib/utils/format";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Field, Select } from "@/components/ui/Field";
import { StatTile } from "@/components/ui/StatTile";
import { DataTable, type Column } from "@/components/data/DataTable";
import { EvIndicator } from "@/components/data/EvIndicator";
import { FormChips, HitRate } from "@/components/data/HitStrip";
import { LineChart } from "@/components/charts/LineChart";

interface TeamIntelligenceProps {
  reference: ReferenceLike;
  forms: TeamForm[];
  matches: Match[];
  teamProps: TeamProp[];
  initialTeamId?: string;
}

interface TableRow extends TeamForm {
  points: number;
  diff: number;
}

export function TeamIntelligence({ reference, forms, matches, teamProps, initialTeamId }: TeamIntelligenceProps) {
  const lookup = useMemo(() => createLookup(reference), [reference]);
  const initialTeam = reference.teams.find((t) => t.id === initialTeamId) ?? reference.teams[0];
  const [leagueId, setLeagueId] = useState(initialTeam?.leagueId ?? "");
  const [teamId, setTeamId] = useState(initialTeam?.id ?? "");

  const league = lookup.league(leagueId);
  const isFootball = league?.sportId === "football";
  const isBasketball = league?.sportId === "basketball";

  const table: TableRow[] = useMemo(
    () =>
      forms
        .filter((f) => lookup.team(f.teamId)?.leagueId === leagueId)
        .map((f) => ({ ...f, points: isFootball ? f.wins * 3 + f.draws : f.wins, diff: f.scored - f.conceded })),
    [forms, leagueId, lookup, isFootball],
  );

  const form = forms.find((f) => f.teamId === teamId);
  const fixtures = matches.filter((m) => m.homeTeamId === teamId || m.awayTeamId === teamId);
  const props = teamProps.filter((p) => p.teamId === teamId);

  const chooseTeam = (id: string) => {
    setTeamId(id);
    window.history.replaceState(null, "", `/teams?team=${id}`);
  };

  const changeLeague = (id: string) => {
    setLeagueId(id);
    const first = reference.teams.find((t) => t.leagueId === id);
    if (first) chooseTeam(first.id);
  };

  const columns: Column<TableRow>[] = [
    {
      key: "team",
      header: "Team",
      sortValue: (r) => lookup.teamName(r.teamId),
      render: (r) => <span className="font-medium text-ink">{lookup.teamName(r.teamId)}</span>,
    },
    { key: "p", header: "P", align: "right", render: (r) => <span className="font-mono tabular">{r.played}</span>, hideBelow: "sm" },
    {
      key: "wdl",
      header: isFootball ? "W-D-L" : "W-L",
      align: "right",
      render: (r) => <span className="font-mono tabular">{isFootball ? `${r.wins}-${r.draws}-${r.losses}` : `${r.wins}-${r.losses}`}</span>,
    },
    { key: "diff", header: "Diff", align: "right", sortValue: (r) => r.diff, render: (r) => <span className="font-mono tabular">{r.diff > 0 ? `+${r.diff}` : r.diff}</span>, hideBelow: "sm" },
    { key: "form", header: "Form", render: (r) => <FormChips results={r.lastFive} />, hideBelow: "md" },
    { key: "pts", header: isFootball ? "Pts" : "Wins", align: "right", sortValue: (r) => r.points * 1000 + r.diff, render: (r) => <span className="font-mono font-semibold tabular text-ink">{r.points}</span> },
  ];

  const per = (n: number, d: number) => (d ? (n / d).toFixed(isBasketball ? 1 : 2) : "—");

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:max-w-2xl">
          <Field label="League" htmlFor="team-league">
            <Select id="team-league" value={leagueId} onValueChange={changeLeague} options={reference.leagues.map((l) => ({ value: l.id, label: l.name }))} />
          </Field>
          <Field label="Team" htmlFor="team-select">
            <Select
              id="team-select"
              value={teamId}
              onValueChange={chooseTeam}
              options={reference.teams.filter((t) => t.leagueId === leagueId).map((t) => ({ value: t.id, label: t.name }))}
            />
          </Field>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader title={`${league?.name ?? ""} — form table`} subtitle="Last 10 games per team (synthetic)" />
          <DataTable
            rows={table}
            columns={columns}
            rowKey={(r) => r.teamId}
            initialSort={{ key: "pts", direction: "desc" }}
            onRowClick={(r) => chooseTeam(r.teamId)}
            selectedKey={teamId}
            dense
            caption="League form table"
          />
        </Card>

        {form ? (
          <div className="min-w-0 space-y-5 xl:col-span-3">
            <Card>
              <CardBody className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-ink">{lookup.teamName(teamId)}</h2>
                  <p className="text-[13px] text-ink-3">
                    Home {form.homeRecord} · Away {form.awayRecord}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <FormChips results={form.lastFive} />
                  <Badge tone="warning">Demo</Badge>
                </div>
              </CardBody>
            </Card>

            <section aria-label="Team metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile label={isBasketball ? "Points for / g" : "Goals for / g"} value={per(form.scored, form.played)} trend={form.scoringTrend} />
              <StatTile label={isBasketball ? "Points against / g" : "Goals against / g"} value={per(form.conceded, form.played)} trend={form.concedingTrend} />
              {form.xgFor !== undefined ? <StatTile label="xG for / against" value={`${form.xgFor.toFixed(2)} / ${form.xgAgainst?.toFixed(2)}`} hint="Per game" /> : null}
              {form.pace !== undefined ? <StatTile label="Pace" value={form.pace.toFixed(1)} hint="Possessions per 48" /> : null}
              <StatTile label="Record" value={isFootball ? `${form.wins}-${form.draws}-${form.losses}` : `${form.wins}-${form.losses}`} hint={`Last ${form.played}`} />
            </section>

            <Card>
              <CardHeader title="Scoring vs conceding" subtitle="Per game, last 10 (oldest → newest)" />
              <CardBody>
                <LineChart
                  series={[
                    { id: "for", label: "Scored", values: form.scoringTrend, slot: 1 },
                    { id: "against", label: "Conceded", values: form.concedingTrend, slot: 2 },
                  ]}
                  xLabels={form.scoringTrend.map((_, i) => `G${i + 1}`)}
                  formatY={(v) => v.toFixed(isBasketball ? 0 : 1)}
                  zeroBased={!isBasketball}
                  height={210}
                  ariaLabel="Scored and conceded per game"
                />
              </CardBody>
            </Card>

            <div className="grid gap-5 lg:grid-cols-2">
              <Card>
                <CardHeader title="Upcoming fixtures" />
                <ul>
                  {fixtures.map((m) => {
                    const home = m.homeTeamId === teamId;
                    return (
                      <li key={m.id}>
                        <Link href={`/match-analyzer?match=${m.id}`} className="flex items-center justify-between gap-3 border-b border-line/70 px-4 py-2.5 hover:bg-surface-2">
                          <span className="text-[13px] text-ink">
                            <span className="mr-1.5 text-[11px] text-ink-3">{home ? "vs" : "@"}</span>
                            {lookup.teamName(home ? m.awayTeamId : m.homeTeamId)}
                          </span>
                          <span className="font-mono text-[11px] tabular text-ink-3">{m.status === "live" ? "LIVE" : formatKickoff(m.kickoff)}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </Card>
              <Card>
                <CardHeader title="Team props" subtitle="Upcoming synthetic lines" />
                <ul>
                  {props.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 border-b border-line/70 px-4 py-2 last:border-0">
                      <div className="min-w-0">
                        <div className="truncate text-[13px] text-ink">
                          {p.market} {p.line}
                        </div>
                        <div className="text-[11px] text-ink-3">
                          O {formatOdds(p.overOdds)} · U {formatOdds(p.underOdds)} · L10 <HitRate rate={p.hitRateL10} className="text-[11px]" />
                        </div>
                      </div>
                      <EvIndicator ev={p.ev} meter={false} />
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
