"use client";

import { useState, type ReactNode } from "react";
import type { DatasetMeta, SearchEntry } from "@/lib/domain/types";
import { Sidebar } from "./Sidebar";
import { TopNav } from "./TopNav";

interface AppShellProps {
  children: ReactNode;
  searchIndex: SearchEntry[];
  feedMeta: DatasetMeta;
}

/** Sidebar + top bar frame for all authenticated-style app pages. */
export function AppShell({ children, searchIndex, feedMeta }: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-dvh">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="lg:pl-60">
        <TopNav searchIndex={searchIndex} feedMeta={feedMeta} onOpenMenu={() => setMenuOpen(true)} />
        <main className="mx-auto w-full max-w-[1600px] px-4 py-6 lg:px-6">{children}</main>
        <footer className="mx-auto max-w-[1600px] border-t border-line px-4 py-4 text-[11px] leading-5 text-ink-3 lg:px-6">
          BettingValue · Phase 1 preview. Analytics are informational only and are not betting advice. All data shown is synthetic. 18+ · Gamble
          responsibly.
        </footer>
      </div>
    </div>
  );
}
