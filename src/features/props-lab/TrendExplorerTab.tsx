"use client";

import { useMemo, useState } from "react";
import type { Trend } from "@/lib/domain/types";
import type { Lookup } from "@/lib/domain/lookup";
import { Segmented } from "@/components/ui/Tabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { TrendCard } from "@/components/data/TrendCard";

type Kind = "all" | "player" | "team";
type Side = "all" | "over" | "under";
type Sort = "strength" | "hits";

export function TrendExplorerTab({ rows, lookup }: { rows: Trend[]; lookup: Lookup }) {
  const [kind, setKind] = useState<Kind>("all");
  const [side, setSide] = useState<Side>("all");
  const [sort, setSort] = useState<Sort>("strength");
  const [limit, setLimit] = useState(24);

  const visible = useMemo(() => {
    const filtered = rows.filter((t) => (kind === "all" || t.kind === kind) && (side === "all" || t.side === side));
    // Rows arrive pre-ranked by streak strength (vs model expectation); "hits" re-sorts by raw count.
    return sort === "hits" ? [...filtered].sort((a, b) => b.hits / b.sample - a.hits / a.sample) : filtered;
  }, [rows, kind, side, sort]);

  const nameFor = (t: Trend) => (t.kind === "player" ? lookup.playerName(t.subjectId) : lookup.teamName(t.subjectId));
  const contextFor = (t: Trend) => {
    if (t.kind === "player") {
      const p = lookup.player(t.subjectId);
      return `${p ? lookup.teamName(p.teamId) : ""} · ${lookup.leagueName(t.leagueId)}`;
    }
    return `Team trend · ${lookup.leagueName(t.leagueId)}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          ariaLabel="Trend subject"
          value={kind}
          onChange={setKind}
          options={[
            { id: "all", label: "All" },
            { id: "player", label: "Players" },
            { id: "team", label: "Teams" },
          ]}
        />
        <Segmented
          ariaLabel="Trend side"
          value={side}
          onChange={setSide}
          options={[
            { id: "all", label: "Over & Under" },
            { id: "over", label: "Over" },
            { id: "under", label: "Under" },
          ]}
        />
        <Segmented
          ariaLabel="Sort trends"
          value={sort}
          onChange={setSort}
          options={[
            { id: "strength", label: "Most unusual" },
            { id: "hits", label: "Highest hit rate" },
          ]}
        />
        <span className="text-xs text-ink-3">{visible.length} trends · last 10 games</span>
      </div>

      {visible.length === 0 ? (
        <EmptyState message="No streaks match these filters." />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {visible.slice(0, limit).map((t) => (
              <TrendCard key={t.id} trend={t} subjectName={nameFor(t)} context={contextFor(t)} />
            ))}
          </div>
          {visible.length > limit ? (
            <div className="text-center">
              <button type="button" onClick={() => setLimit((l) => l + 24)} className="text-xs text-accent hover:underline">
                Show more ({visible.length - limit} remaining)
              </button>
            </div>
          ) : null}
        </>
      )}
      <p className="text-[11px] text-ink-3">
        “Most unusual” ranks streaks by how far the observed hit rate exceeds what the model projection would expect. Streaks are descriptive; small samples are
        noisy and past hit rates do not guarantee future outcomes.
      </p>
    </div>
  );
}
