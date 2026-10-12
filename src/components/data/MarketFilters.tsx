"use client";

import { useId } from "react";
import { RotateCcw, Search } from "lucide-react";
import { DEFAULT_FILTERS, type MarketFilterState } from "@/lib/domain/filters";
import type { ReferenceLike } from "@/lib/domain/lookup";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, type SelectOption } from "@/components/ui/Field";

export type FilterField = "sport" | "league" | "team" | "player" | "market" | "minEv" | "query";

interface MarketFiltersProps {
  value: MarketFilterState;
  onChange: (next: MarketFilterState) => void;
  reference: ReferenceLike;
  fields: FilterField[];
  /** Market names available in the current dataset. */
  markets?: string[];
  minEvOptions?: number[];
  className?: string;
}

/**
 * One-row filter bar shared by the scanner, Props Lab and explorers.
 * Options cascade: sport → league → team → player.
 */
export function MarketFilters({
  value,
  onChange,
  reference,
  fields,
  markets = [],
  minEvOptions = [-1, 0, 0.01, 0.02, 0.03, 0.05, 0.08],
  className,
}: MarketFiltersProps) {
  const id = useId();
  const set = (patch: Partial<MarketFilterState>) => onChange({ ...value, ...patch });

  const leagues = reference.leagues.filter((l) => value.sportId === "all" || l.sportId === value.sportId);
  const teams = reference.teams.filter(
    (t) => (value.sportId === "all" || t.sportId === value.sportId) && (value.leagueId === "all" || t.leagueId === value.leagueId),
  );
  const teamIds = new Set(teams.map((t) => t.id));
  const players = reference.players.filter((p) => teamIds.has(p.teamId) && (value.teamId === "all" || p.teamId === value.teamId));

  const opts = (all: string, items: SelectOption[]): SelectOption[] => [{ value: "all", label: all }, ...items];
  const has = (f: FilterField) => fields.includes(f);

  return (
    <div className={className}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:flex lg:flex-wrap lg:items-end">
        {has("query") ? (
          <Field label="Search" htmlFor={`${id}-q`} className="col-span-2 sm:col-span-3 lg:w-56">
            <div className="relative">
              <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" />
              <Input id={`${id}-q`} value={value.query} onChange={(e) => set({ query: e.target.value })} placeholder="Team, player, market…" className="pl-8" />
            </div>
          </Field>
        ) : null}
        {has("sport") ? (
          <Field label="Sport" htmlFor={`${id}-sport`} className="lg:w-36">
            <Select
              id={`${id}-sport`}
              value={value.sportId}
              onValueChange={(v) => set({ sportId: v as MarketFilterState["sportId"], leagueId: "all", teamId: "all", playerId: "all", market: "all" })}
              options={opts("All sports", reference.sports.map((s) => ({ value: s.id, label: s.name })))}
            />
          </Field>
        ) : null}
        {has("league") ? (
          <Field label="League" htmlFor={`${id}-league`} className="lg:w-44">
            <Select
              id={`${id}-league`}
              value={value.leagueId}
              onValueChange={(v) => set({ leagueId: v, teamId: "all", playerId: "all" })}
              options={opts("All leagues", leagues.map((l) => ({ value: l.id, label: l.name })))}
            />
          </Field>
        ) : null}
        {has("team") ? (
          <Field label="Team" htmlFor={`${id}-team`} className="lg:w-44">
            <Select
              id={`${id}-team`}
              value={value.teamId}
              onValueChange={(v) => set({ teamId: v, playerId: "all" })}
              options={opts("All teams", teams.map((t) => ({ value: t.id, label: t.name })))}
            />
          </Field>
        ) : null}
        {has("player") ? (
          <Field label="Player" htmlFor={`${id}-player`} className="lg:w-44">
            <Select
              id={`${id}-player`}
              value={value.playerId}
              onValueChange={(v) => set({ playerId: v })}
              options={opts("All players", players.map((p) => ({ value: p.id, label: p.name })))}
            />
          </Field>
        ) : null}
        {has("market") ? (
          <Field label="Market" htmlFor={`${id}-market`} className="lg:w-40">
            <Select
              id={`${id}-market`}
              value={value.market}
              onValueChange={(v) => set({ market: v })}
              options={opts("All markets", markets.map((m) => ({ value: m, label: m })))}
            />
          </Field>
        ) : null}
        {has("minEv") ? (
          <Field label="Min EV" htmlFor={`${id}-ev`} className="lg:w-28">
            <Select
              id={`${id}-ev`}
              value={String(value.minEv)}
              onValueChange={(v) => set({ minEv: Number(v) })}
              options={minEvOptions.map((v) => ({ value: String(v), label: v < 0 ? "Any" : v === 0 ? "Positive" : `≥ ${Math.round(v * 100)}%` }))}
            />
          </Field>
        ) : null}
        <div className="flex items-end">
          <Button variant="ghost" size="md" className="h-8" onClick={() => onChange({ ...DEFAULT_FILTERS })} aria-label="Reset filters">
            <RotateCcw className="size-3.5" /> Reset
          </Button>
        </div>
      </div>
    </div>
  );
}
