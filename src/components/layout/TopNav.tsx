"use client";

import Link from "next/link";
import { Bell, Menu } from "lucide-react";
import type { DatasetMeta, SearchEntry } from "@/lib/domain/types";
import { FreshnessIndicator } from "@/components/data/FreshnessIndicator";
import { buttonClasses } from "@/components/ui/Button";
import { GlobalSearch } from "./GlobalSearch";

interface TopNavProps {
  searchIndex: SearchEntry[];
  feedMeta: DatasetMeta;
  onOpenMenu: () => void;
}

export function TopNav({ searchIndex, feedMeta, onOpenMenu }: TopNavProps) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-canvas/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-canvas/75 lg:px-6">
      <button type="button" onClick={onOpenMenu} className="rounded p-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink lg:hidden" aria-label="Open navigation">
        <Menu className="size-5" />
      </button>

      <GlobalSearch index={searchIndex} />

      <div className="ml-auto flex items-center gap-3">
        <FreshnessIndicator meta={feedMeta} label="Odds feed" className="hidden md:inline-flex" />
        <span className="hidden h-5 w-px bg-line md:block" aria-hidden />
        <button type="button" className="relative rounded p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Alerts (not available in Phase 1)" title="Alerts arrive in a later phase">
          <Bell className="size-4" />
        </button>
        <Link href="/login" className={buttonClasses("secondary", "sm")}>
          Sign in
        </Link>
      </div>
    </header>
  );
}
