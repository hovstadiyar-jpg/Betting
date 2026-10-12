"use client";

import { useMemo, useState } from "react";
import type { Player, PlayerProfile, PlayerProp } from "@/lib/domain/types";
import { DEFAULT_FILTERS, matchesFilters, type MarketFilterState } from "@/lib/domain/filters";
import { createLookup, type ReferenceLike } from "@/lib/domain/lookup";
import { formatOdds } from "@/lib/utils/format";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Segmented } from "@/components/ui/Tabs";
import { StatTile } from "@/components/ui/StatTile";
import { EmptyState } from "@/components/ui/EmptyState";
import { MarketFilters } from "@/components/data/MarketFilters";
import { DataTable, type Column } from "@/components/data/DataTable";
import { EvIndicator } from "@/components/data/EvIndicator";
import { HitRate } from "@/components/data/HitStrip";
import { BarChart } from "@/components/charts/BarChart";

interface PlayerIntelligenceProps {
  reference: ReferenceLike;
  profiles: PlayerProfile[];
  playerProps: PlayerProp[];
  initialPlayerId?: string;
}

const STATUS_TONE: Record<PlayerProfile["injuryStatus"], BadgeTone> = { available: "positive", questionable: "warning", out: "negative" };

export function PlayerIntelligence({ reference, profiles, playerProps, initialPlayerId }: PlayerIntelligenceProps) {
  const lookup = useMemo(() => createLookup(reference), [reference]);
  const profileById = useMemo(() => new Map(profiles.map((p) => [p.playerId, p])), [profiles]);
  const initialPlayer = reference.players.find((p) => p.id === initialPlayerId);

  const [filters, setFilters] = useState<MarketFilterState>(() =>
    initialPlayer ? { ...DEFAULT_FILTERS, sportId: initialPlayer.sportId } : DEFAULT_FILTERS,
  );
  const [playerId, setPlayerId] = useState(initialPlayer?.id ?? reference.players[0]?.id ?? "");
  const [market, setMarket] = useState<string | undefined>();

  const players = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    return reference.players.filter((p) => {
      const team = lookup.team(p.teamId);
      if (!team) return false;
      if (!matchesFilters({ sportId: p.sportId, leagueId: team.leagueId, teamId: p.teamId }, filters)) return false;
      return !q || `${p.name} ${team.name} ${p.position}`.toLowerCase().includes(q);
    });
  }, [reference.players, filters, lookup]);

  const player = reference.players.find((p) => p.id === playerId);
  const profile = profileById.get(playerId);
  const markets = profile ? Object.keys(profile.averages) : [];
  const activeMarket = market && markets.includes(market) ? market : markets[0];
  const upcoming = playerProps.filter((p) => p.playerId === playerId);
  const upcomingForMarket = upcoming.find((p) => p.market === activeMarket);

  const choose = (p: Player) => {
    setPlayerId(p.id);
    setMarket(undefined);
    window.history.replaceState(null, "", `/players?player=${p.id}`);
  };

  const columns: Column<Player>[] = [
    {
      key: "name",
      header: "Player",
      sortValue: (p) => p.name,
      render: (p) => (
        <div>
          <div className="font-medium text-ink">{p.name}</div>
          <div className="text-[11px] text-ink-3">
            {lookup.teamShort(p.teamId)} · {p.position}
          </div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      align: "right",
      render: (p) => {
        const s = profileById.get(p.id)?.injuryStatus ?? "available";
        return s === "available" ? <span className="text-xs text-ink-3">Fit</span> : <Badge tone={STATUS_TONE[s]}>{s}</Badge>;
      },
    },
  ];

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <MarketFilters value={filters} onChange={setFilters} reference={reference} fields={["query", "sport", "league", "team"]} />
      </Card>

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <Card className="max-h-[720px] overflow-y-auto">
          <DataTable
            rows={players}
            columns={columns}
            rowKey={(p) => p.id}
            onRowClick={choose}
            selectedKey={playerId}
            dense
            caption="Players"
            emptyMessage="No players match these filters."
          />
        </Card>

        {player && profile ? (
          <div className="min-w-0 space-y-5">
            <Card>
              <CardBody className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-ink">{player.name}</h2>
                  <p className="text-[13px] text-ink-3">
                    {player.position} · {lookup.teamName(player.teamId)} · {lookup.leagueName(lookup.team(player.teamId)?.leagueId ?? "")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={STATUS_TONE[profile.injuryStatus]}>{profile.injuryStatus}</Badge>
                  <Badge tone="warning">Demo</Badge>
                </div>
              </CardBody>
            </Card>

            <section aria-label="Season averages" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile label="Games played" value={profile.gamesPlayed} hint={`${profile.minutesAvg.toFixed(1)} min per game`} />
              {markets.map((m) => (
                <StatTile key={m} label={`${m} avg`} value={profile.averages[m]?.toFixed(1)} hint="Last 20 games" trend={profile.recentByMarket[m]} />
              ))}
              {profile.usageRate !== undefined ? <StatTile label="Usage rate" value={`${profile.usageRate.toFixed(1)}%`} hint="Share of team possessions" /> : null}
            </section>

            <Card>
              <CardHeader
                title="Game log"
                subtitle={upcomingForMarket ? `Last 10 vs upcoming line ${upcomingForMarket.line}` : "Last 10 games"}
                actions={
                  activeMarket ? (
                    <Segmented ariaLabel="Stat" value={activeMarket} onChange={setMarket} options={markets.map((m) => ({ id: m, label: m }))} />
                  ) : null
                }
              />
              <CardBody>
                {activeMarket ? (
                  <BarChart
                    data={(profile.recentByMarket[activeMarket] ?? []).map((v, i) => ({ label: `G${i + 1}`, value: v }))}
                    threshold={upcomingForMarket?.line}
                    thresholdLabel={upcomingForMarket ? `Line ${upcomingForMarket.line}` : undefined}
                    legend={upcomingForMarket ? { above: "Over the line", below: "Under the line" } : undefined}
                    showValues
                    height={220}
                    ariaLabel={`${player.name} ${activeMarket} last 10 games`}
                  />
                ) : null}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Upcoming props" subtitle="Synthetic lines for this player's next fixtures" />
              {upcoming.length === 0 ? (
                <EmptyState title="No upcoming props" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-line text-[11px] uppercase tracking-wider text-ink-3">
                        <th scope="col" className="px-4 py-2 text-left font-medium">Market</th>
                        <th scope="col" className="px-3 py-2 text-left font-medium">Opponent</th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">Line</th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">Over / Under</th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">L10</th>
                        <th scope="col" className="px-4 py-2 text-right font-medium">Best</th>
                      </tr>
                    </thead>
                    <tbody>
                      {upcoming.map((p) => (
                        <tr key={p.id} className="border-b border-line/70 last:border-0">
                          <td className="px-4 py-2 text-ink">{p.market}</td>
                          <td className="px-3 py-2 text-ink-2">{lookup.teamName(p.opponentId)}</td>
                          <td className="px-3 py-2 text-right font-mono tabular text-ink">{p.line}</td>
                          <td className="px-3 py-2 text-right font-mono tabular text-ink-2">
                            {formatOdds(p.overOdds)} / {formatOdds(p.underOdds)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <HitRate rate={p.hitRateL10} />
                          </td>
                          <td className="px-4 py-2 text-right">
                            <span className="mr-2 text-xs text-ink-3">{p.bestSide === "over" ? "Over" : "Under"}</span>
                            <EvIndicator ev={p.ev} meter={false} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        ) : (
          <EmptyState title="Select a player" />
        )}
      </div>
    </div>
  );
}
