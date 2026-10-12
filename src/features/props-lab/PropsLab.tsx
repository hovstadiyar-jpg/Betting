"use client";

import { useMemo, useState } from "react";
import { Activity, BarChart3, Shield, Swords, UserRound } from "lucide-react";
import type { LineMovement, Matchup, PlayerProp, TeamProp, Trend } from "@/lib/domain/types";
import { DEFAULT_FILTERS, matchesFilters, type MarketFilterState } from "@/lib/domain/filters";
import { createLookup, type ReferenceLike } from "@/lib/domain/lookup";
import { Card } from "@/components/ui/Card";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { MarketFilters, type FilterField } from "@/components/data/MarketFilters";
import { PlayerPropsTab } from "./PlayerPropsTab";
import { TeamPropsTab } from "./TeamPropsTab";
import { TrendExplorerTab } from "./TrendExplorerTab";
import { MatchupTab } from "./MatchupTab";
import { LineMovementTab } from "./LineMovementTab";

type TabId = "player" | "team" | "trends" | "matchups" | "movement";

interface PropsLabProps {
  reference: ReferenceLike;
  playerProps: PlayerProp[];
  teamProps: TeamProp[];
  trends: Trend[];
  matchups: Matchup[];
  movements: LineMovement[];
}

const FIELDS: Record<TabId, FilterField[]> = {
  player: ["query", "sport", "league", "team", "player", "market", "minEv"],
  team: ["query", "sport", "league", "team", "market", "minEv"],
  trends: ["query", "sport", "league", "team", "player", "market"],
  matchups: ["query", "sport", "league", "team", "player", "market"],
  movement: ["query", "sport", "league", "team", "player", "market"],
};

const unique = (xs: string[]) => [...new Set(xs)].sort();

export function PropsLab({ reference, playerProps, teamProps, trends, matchups, movements }: PropsLabProps) {
  const [tab, setTab] = useState<TabId>("player");
  const [filters, setFilters] = useState<MarketFilterState>(DEFAULT_FILTERS);
  const lookup = useMemo(() => createLookup(reference), [reference]);

  const leagueSizes = useMemo(() => {
    const out: Record<string, number> = {};
    for (const t of reference.teams) out[t.leagueId] = (out[t.leagueId] ?? 0) + 1;
    return out;
  }, [reference]);

  const filtered = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    const textMatch = (...parts: string[]) => !q || parts.join(" ").toLowerCase().includes(q);
    const teamOfPlayer = (playerId: string) => lookup.player(playerId)?.teamId;

    const player = playerProps.filter(
      (p) => matchesFilters(p, filters) && textMatch(lookup.playerName(p.playerId), lookup.teamName(p.teamId), p.market),
    );
    const team = teamProps.filter((p) => matchesFilters(p, filters) && textMatch(lookup.teamName(p.teamId), lookup.teamName(p.opponentId), p.market));
    const trend = trends.filter((t) => {
      const teamId = t.kind === "player" ? teamOfPlayer(t.subjectId) : t.subjectId;
      const playerId = t.kind === "player" ? t.subjectId : undefined;
      if (filters.playerId !== "all" && playerId !== filters.playerId) return false;
      const name = t.kind === "player" ? lookup.playerName(t.subjectId) : lookup.teamName(t.subjectId);
      return matchesFilters({ ...t, teamId, playerId }, filters) && textMatch(name, t.market);
    });
    const matchup = matchups.filter((m) => {
      const teamId = teamOfPlayer(m.playerId);
      return matchesFilters({ ...m, teamId }, filters) && textMatch(lookup.playerName(m.playerId), lookup.teamName(m.opponentId), m.market);
    });
    const movement = movements.filter((m) => {
      const isPlayer = m.category === "player-prop";
      const playerId = isPlayer ? m.subjectId : undefined;
      if (filters.playerId !== "all" && playerId !== filters.playerId) return false;
      const teamId = isPlayer && m.subjectId ? teamOfPlayer(m.subjectId) : m.subjectId;
      const market = m.marketName.split(" · ")[1] ?? m.marketName;
      return matchesFilters({ sportId: m.sportId, leagueId: m.leagueId, teamId, playerId, market }, filters) && textMatch(m.marketName);
    });
    return { player, team, trend, matchup, movement };
  }, [playerProps, teamProps, trends, matchups, movements, filters, lookup]);

  const marketOptions: Record<TabId, string[]> = useMemo(
    () => ({
      player: unique(playerProps.map((p) => p.market)),
      team: unique(teamProps.map((p) => p.market)),
      trends: unique(trends.map((t) => t.market)),
      matchups: unique(matchups.map((m) => m.market)),
      movement: unique(movements.map((m) => m.marketName.split(" · ")[1] ?? m.marketName)),
    }),
    [playerProps, teamProps, trends, matchups, movements],
  );

  const tabs: TabItem<TabId>[] = [
    { id: "player", label: "Player Props", icon: <UserRound className="size-3.5" />, count: filtered.player.length },
    { id: "team", label: "Team Props", icon: <Shield className="size-3.5" />, count: filtered.team.length },
    { id: "trends", label: "Trend Explorer", icon: <BarChart3 className="size-3.5" />, count: filtered.trend.length },
    { id: "matchups", label: "Matchup Analysis", icon: <Swords className="size-3.5" />, count: filtered.matchup.length },
    { id: "movement", label: "Line Movement", icon: <Activity className="size-3.5" />, count: filtered.movement.length },
  ];

  const changeTab = (id: TabId) => {
    setTab(id);
    // Market names differ per tab; drop an incompatible market filter (and player filter on the team tab).
    setFilters((f) => ({
      ...f,
      market: marketOptions[id].includes(f.market) ? f.market : "all",
      playerId: id === "team" ? "all" : f.playerId,
    }));
  };

  return (
    <div className="space-y-4">
      <Tabs tabs={tabs} value={tab} onChange={changeTab} ariaLabel="Props Lab sections" />

      <Card className="p-4">
        <MarketFilters value={filters} onChange={setFilters} reference={reference} fields={FIELDS[tab]} markets={marketOptions[tab]} />
      </Card>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "player" ? <PlayerPropsTab rows={filtered.player} lookup={lookup} /> : null}
        {tab === "team" ? <TeamPropsTab rows={filtered.team} lookup={lookup} /> : null}
        {tab === "trends" ? <TrendExplorerTab rows={filtered.trend} lookup={lookup} /> : null}
        {tab === "matchups" ? <MatchupTab rows={filtered.matchup} lookup={lookup} leagueSizes={leagueSizes} /> : null}
        {tab === "movement" ? <LineMovementTab rows={filtered.movement} lookup={lookup} /> : null}
      </div>
    </div>
  );
}
