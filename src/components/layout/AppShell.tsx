"use client";

import { useState, type ReactNode } from "react";
import type { DatasetMeta, SearchEntry } from "@/lib/domain/types";
import { Sidebar } from "./Sidebar";
import { TopNav } from "./TopNav";

interface AppShellProps {
  children: ReactNode;
  searchIndex: SearchEntry[];
  /** Undefined when the data service could not be reached. */
  feedMeta?: DatasetMeta;
  /** "mock": everything synthetic. "api": odds from the backend, stats pages synthetic. */
  dataMode: "mock" | "api";
}

/** Sidebar + top bar frame for all authenticated-style app pages. */
export function AppShell({ children, searchIndex, feedMeta, dataMode }: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-dvh">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} dataMode={dataMode} liveOdds={feedMeta?.source === "live"} />
      <div className="lg:pl-60">
        <TopNav searchIndex={searchIndex} feedMeta={feedMeta} onOpenMenu={() => setMenuOpen(true)} />
        <main className="mx-auto w-full max-w-[1600px] px-4 py-6 lg:px-6">{children}</main>
        <footer className="mx-auto max-w-[1600px] border-t border-line px-4 py-4 text-[11px] leading-5 text-ink-3 lg:px-6">
          BettingValue preview. Analytics are informational only and are not betting advice. Anything labelled Demo is synthetic data. 18+ ·
          Gamble responsibly.
        </footer>
      </div>
    </div>
  );
}
