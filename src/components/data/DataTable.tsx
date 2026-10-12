"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { EmptyState } from "@/components/ui/EmptyState";

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  /** Provide to make the column sortable. */
  sortValue?: (row: T) => number | string;
  align?: "left" | "right" | "center";
  className?: string;
  /** Hide below a breakpoint to keep tables readable on phones. */
  hideBelow?: "sm" | "md" | "lg" | "xl" | "2xl";
}

interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  initialSort?: { key: string; direction: "asc" | "desc" };
  onRowClick?: (row: T) => void;
  selectedKey?: string;
  maxRows?: number;
  emptyMessage?: string;
  dense?: boolean;
  className?: string;
  caption?: string;
}

const HIDE: Record<NonNullable<Column<unknown>["hideBelow"]>, string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
  "2xl": "hidden 2xl:table-cell",
};

/** Lightweight sortable table with a sticky header. No virtualisation needed at demo sizes. */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  initialSort,
  onRowClick,
  selectedKey,
  maxRows,
  emptyMessage = "Try widening your filters.",
  dense = false,
  className,
  caption,
}: DataTableProps<T>) {
  const [sort, setSort] = useState(initialSort);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort?.key);
    if (!sort || !col?.sortValue) return rows;
    const get = col.sortValue;
    const dir = sort.direction === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
    });
  }, [rows, columns, sort]);

  const visible = maxRows ? sorted.slice(0, maxRows) : sorted;

  const toggle = (key: string) =>
    setSort((s) => (s?.key === key ? { key, direction: s.direction === "desc" ? "asc" : "desc" } : { key, direction: "desc" }));

  if (rows.length === 0) return <EmptyState message={emptyMessage} />;

  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full border-collapse text-[13px]">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead className="sticky top-0 z-[1] bg-surface">
          <tr className="border-b border-line">
            {columns.map((c) => {
              const active = sort?.key === c.key;
              const align = c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left";
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={active ? (sort?.direction === "asc" ? "ascending" : "descending") : undefined}
                  className={cn(
                    "whitespace-nowrap px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-ink-3",
                    align,
                    c.hideBelow && HIDE[c.hideBelow],
                    c.className,
                  )}
                >
                  {c.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggle(c.key)}
                      className={cn("inline-flex items-center gap-1 uppercase hover:text-ink-2", active && "text-ink-2", c.align === "right" && "flex-row-reverse")}
                    >
                      {c.header}
                      {active ? (
                        sort?.direction === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
                      ) : (
                        <ArrowUpDown className="size-3 opacity-40" />
                      )}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => {
            const key = rowKey(row);
            return (
              <tr
                key={key}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  "border-b border-line/70 last:border-0",
                  onRowClick && "cursor-pointer hover:bg-surface-2",
                  selectedKey === key && "bg-accent-soft hover:bg-accent-soft",
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "whitespace-nowrap px-3 text-ink-2",
                      dense ? "py-1.5" : "py-2.5",
                      c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left",
                      c.hideBelow && HIDE[c.hideBelow],
                      c.className,
                    )}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {maxRows && sorted.length > maxRows ? (
        <p className="border-t border-line px-3 py-2 text-xs text-ink-3">
          Showing {maxRows} of {sorted.length}
        </p>
      ) : null}
    </div>
  );
}
