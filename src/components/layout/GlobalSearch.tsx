"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Crosshair, Search, Shield, Trophy, UserRound } from "lucide-react";
import type { SearchEntry } from "@/lib/domain/types";
import { cn } from "@/lib/utils/cn";

const KIND_ICON = {
  team: Shield,
  player: UserRound,
  match: Crosshair,
  league: Trophy,
} as const;

const KIND_LABEL = { team: "Team", player: "Player", match: "Match", league: "League" } as const;

/** Client-side search over a small prebuilt index. Press "/" to focus. */
export function GlobalSearch({ index }: { index: SearchEntry[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return index.filter((e) => e.label.toLowerCase().includes(q) || e.sublabel.toLowerCase().includes(q)).slice(0, 8);
  }, [index, query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT");
      if (e.key === "/" && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, []);

  const go = (entry: SearchEntry) => {
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
    router.push(entry.href);
  };

  const showList = open && query.trim().length >= 2;

  return (
    <div ref={wrapperRef} className="relative w-full max-w-md">
      <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls="global-search-results"
        aria-autocomplete="list"
        aria-label="Search teams, players, matches and leagues"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(results.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter" && results[active]) {
            e.preventDefault();
            go(results[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder="Search teams, players, matches…"
        className="h-9 w-full rounded-md border border-line bg-surface pl-9 pr-10 text-[13px] text-ink placeholder:text-ink-3 hover:border-line-strong focus:border-accent focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-line-strong px-1.5 font-mono text-[10px] text-ink-3 sm:block">
        /
      </kbd>

      {showList ? (
        <ul
          id="global-search-results"
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-md border border-line-strong bg-surface-2 py-1 shadow-xl shadow-black/50"
        >
          {results.length === 0 ? (
            <li className="px-3 py-2 text-xs text-ink-3">No matches in the demo dataset.</li>
          ) : (
            results.map((r, i) => {
              const Icon = KIND_ICON[r.kind];
              return (
                <li key={`${r.kind}-${r.id}`} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    onMouseMove={() => setActive(i)}
                    onClick={() => go(r)}
                    className={cn("flex w-full items-center gap-3 px-3 py-2 text-left", i === active && "bg-surface-3")}
                  >
                    <Icon aria-hidden className="size-4 shrink-0 text-ink-3" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-ink">{r.label}</span>
                      <span className="block truncate text-[11px] text-ink-3">{r.sublabel}</span>
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-ink-3">{KIND_LABEL[r.kind]}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
