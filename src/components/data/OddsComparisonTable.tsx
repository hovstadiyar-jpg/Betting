import type { Bookmaker, Market } from "@/lib/domain/types";
import { expectedValue, fairOdds, overround } from "@/lib/domain/odds";
import { bestQuote } from "@/lib/domain/markets";
import { cn } from "@/lib/utils/cn";
import { formatOdds, formatPct } from "@/lib/utils/format";
import { EvIndicator } from "./EvIndicator";

interface OddsComparisonTableProps {
  market: Market;
  bookmakers: Bookmaker[];
}

/**
 * Selections × bookmakers price grid. Best price per selection is outlined
 * and marked with ▲ so it's identifiable without colour.
 */
export function OddsComparisonTable({ market, bookmakers }: OddsComparisonTableProps) {
  const booksInMarket = bookmakers.filter((b) => market.selections.some((s) => s.quotes.some((q) => q.bookmakerId === b.id)));

  const marginFor = (bookmakerId: string) => {
    const odds = market.selections.map((s) => s.quotes.find((q) => q.bookmakerId === bookmakerId)?.odds);
    return odds.every((o): o is number => o !== undefined) ? overround(odds) : undefined;
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <caption className="sr-only">{market.name} odds comparison</caption>
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-ink-3">
              Selection
            </th>
            {booksInMarket.map((b) => (
              <th key={b.id} scope="col" className="px-2 py-2 text-right text-[11px] font-medium uppercase tracking-wider text-ink-3">
                {b.name}
              </th>
            ))}
            <th scope="col" className="border-l border-line px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wider text-ink-3">
              Fair
            </th>
            <th scope="col" className="px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wider text-ink-3">
              Model
            </th>
            <th scope="col" className="px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wider text-ink-3">
              EV @ best
            </th>
          </tr>
        </thead>
        <tbody>
          {market.selections.map((s) => {
            const best = bestQuote(s.quotes);
            return (
              <tr key={s.id} className="border-b border-line/70">
                <td className="whitespace-nowrap px-3 py-2.5 font-medium text-ink">{s.label}</td>
                {booksInMarket.map((b) => {
                  const q = s.quotes.find((x) => x.bookmakerId === b.id);
                  const isBest = q && best && q.odds === best.odds;
                  return (
                    <td key={b.id} className="px-1.5 py-1.5 text-right">
                      {q ? (
                        <span
                          className={cn(
                            "inline-flex min-w-14 items-center justify-end gap-1 rounded px-1.5 py-1 font-mono tabular",
                            isBest ? "bg-accent-soft font-semibold text-ink ring-1 ring-accent/50" : "text-ink-2",
                          )}
                        >
                          {isBest ? <span aria-label="best price" className="text-[8px] text-accent">▲</span> : null}
                          {formatOdds(q.odds)}
                        </span>
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                    </td>
                  );
                })}
                <td className="border-l border-line px-3 py-2.5 text-right font-mono tabular text-ink-2">{formatOdds(fairOdds(s.modelProbability))}</td>
                <td className="px-3 py-2.5 text-right font-mono tabular text-ink-2">{formatPct(s.modelProbability)}</td>
                <td className="px-3 py-2.5 text-right">{best ? <EvIndicator ev={expectedValue(best.odds, s.modelProbability)} meter={false} /> : null}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td className="px-3 py-2 text-[11px] text-ink-3">Margin</td>
            {booksInMarket.map((b) => {
              const m = marginFor(b.id);
              return (
                <td key={b.id} className="px-2 py-2 text-right font-mono text-[11px] tabular text-ink-3">
                  {m !== undefined ? formatPct(m) : "—"}
                </td>
              );
            })}
            <td colSpan={3} className="border-l border-line" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
