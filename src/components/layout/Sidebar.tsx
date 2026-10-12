"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FlaskConical, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Logo } from "./Logo";
import { NAV_GROUPS } from "./nav-config";

interface SidebarProps {
  /** Mobile drawer state; ignored on large screens where the sidebar is always visible. */
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile backdrop */}
      <div
        aria-hidden
        onClick={onClose}
        className={cn("fixed inset-0 z-30 bg-black/60 backdrop-blur-[1px] transition-opacity lg:hidden", open ? "opacity-100" : "pointer-events-none opacity-0")}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-line bg-canvas transition-transform duration-200 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        aria-label="Primary"
      >
        <div className="flex h-14 items-center justify-between border-b border-line px-4">
          <Link href="/dashboard" onClick={onClose} aria-label="BettingValue home">
            <Logo />
          </Link>
          <button type="button" onClick={onClose} className="rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-ink lg:hidden" aria-label="Close navigation">
            <X className="size-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-5">
              <div className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3">{group.label}</div>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onClose}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group relative flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors",
                          active ? "bg-surface-2 font-medium text-ink" : "text-ink-2 hover:bg-surface hover:text-ink",
                        )}
                      >
                        {active ? <span aria-hidden className="absolute -left-3 top-1.5 bottom-1.5 w-0.5 rounded-r bg-accent" /> : null}
                        <Icon className={cn("size-4 shrink-0", active ? "text-accent" : "text-ink-3 group-hover:text-ink-2")} />
                        <span className="truncate">{item.label}</span>
                        {item.badge ? (
                          <span className="ml-auto rounded bg-warn-soft px-1 text-[9px] font-semibold uppercase tracking-wide text-warn">{item.badge}</span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-line p-3">
          <div className="rounded-md border border-line bg-surface p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-ink">
              <FlaskConical className="size-3.5 text-warn" /> Phase 1 preview
            </div>
            <p className="mt-1 text-[11px] leading-4 text-ink-3">
              Synthetic data only. No bookmaker feeds, accounts or payments are connected.
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
