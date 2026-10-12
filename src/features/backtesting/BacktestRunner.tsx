"use client";

import { useMemo, useState } from "react";
import type { HistoricalBet } from "@/lib/domain/types";
import { DEFAULT_BACKTEST_PARAMS, runBacktest, type BacktestParams } from "@/lib/domain/backtest";
import type { ReferenceLike } from "@/lib/domain/lookup";
import { formatOdds, formatPct, formatSignedPct, formatUnits } from "@/lib/utils/format";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { StatTile } from "@/components/ui/StatTile";
import { EmptyState } from "@/components/ui/EmptyState";
import { DataTable, type Column } from "@/components/data/DataTable";
import { LineChart } from "@/components/charts/LineChart";
import { BarChart } from "@/components/charts/BarChart";

const MARKET_TYPES: Array<{ value: BacktestParams["marketType"]; label: string }> = [
  { value: "all", label: "All markets" },
  { value: "match-result", label: "Match result" },
  { value: "moneyline", label: "Moneyline" },
  { value: "handicap", label: "Handicap" },
  { value: "total", label: "Totals" },
  { value: "btts", label: "Both teams to score" },
  { value: "player-prop", label: "Player props" },
  { value: "team-prop", label: "Team props" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function BacktestRunner({ history, reference }: { history: HistoricalBet[]; reference: ReferenceLike }) {
  const [draft, setDraft] = useState<BacktestParams>(DEFAULT_BACKTEST_PARAMS);
  const [params, setParams] = useState<BacktestParams>(DEFAULT_BACKTEST_PARAMS);
  const result = useMemo(() => runBacktest(history, params), [history, params]);

  const set = (patch: Partial<BacktestParams>) => setDraft((d) => ({ ...d, ...patch }));

  // Numeric fields keep their raw text so users can clear and retype; parsed on submit.
  const toText = (p: BacktestParams) => ({ minEv: String(Math.round(p.minEv * 1000) / 10), minOdds: String(p.minOdds), maxOdds: String(p.maxOdds) });
  const [text, setText] = useState(() => toText(DEFAULT_BACKTEST_PARAMS));
  const parse = (raw: string, fallback: number, divisor = 1) => {
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? n / divisor : fallback;
  };
  const pending: BacktestParams = {
    ...draft,
    minEv: parse(text.minEv, draft.minEv, 100),
    minOdds: parse(text.minOdds, draft.minOdds),
    maxOdds: parse(text.maxOdds, draft.maxOdds),
  };
  const dirty = JSON.stringify(pending) !== JSON.stringify(params);

  const recent = useMemo(() => {
    const filtered = history.filter(
      (b) =>
        (params.sportId === "all" || b.sportId === params.sportId) &&
        (params.marketType === "all" || b.marketType === params.marketType) &&
        b.ev >= params.minEv &&
        b.odds >= params.minOdds &&
        b.odds <= params.maxOdds,
    );
    return filtered.slice(-40).reverse();
  }, [history, params]);

  const columns: Column<HistoricalBet>[] = [
    { key: "date", header: "Date", sortValue: (b) => b.date, render: (b) => <span className="font-mono text-xs tabular">{b.date}</span> },
    { key: "sel", header: "Selection", render: (b) => <span className="text-ink">{b.selection}</span> },
    { key: "odds", header: "Odds", align: "right", sortValue: (b) => b.odds, render: (b) => <span className="font-mono tabular">{formatOdds(b.odds)}</span> },
    { key: "close", header: "Close", align: "right", sortValue: (b) => b.closingOdds, render: (b) => <span className="font-mono tabular text-ink-3">{formatOdds(b.closingOdds)}</span>, hideBelow: "md" },
    { key: "ev", header: "Model EV", align: "right", sortValue: (b) => b.ev, render: (b) => <span className="font-mono tabular">{formatSignedPct(b.ev)}</span>, hideBelow: "sm" },
    {
      key: "res",
      header: "Result",
      align: "right",
      sortValue: (b) => (b.won ? 1 : 0),
      render: (b) => (b.won ? <span className="font-medium text-pos">Won</span> : <span className="text-neg">Lost</span>),
    },
  ];

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Strategy parameters" subtitle="Replays the synthetic bet history under your rules" />
        <CardBody>
          <form
            noValidate
            className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7 xl:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              setDraft(pending);
              setText(toText(pending));
              setParams(pending);
            }}
          >
            <Field label="Sport" htmlFor="bt-sport">
              <Select
                id="bt-sport"
                value={draft.sportId}
                onValueChange={(v) => set({ sportId: v as BacktestParams["sportId"] })}
                options={[{ value: "all", label: "All sports" }, ...reference.sports.map((s) => ({ value: s.id, label: s.name }))]}
              />
            </Field>
            <Field label="Market" htmlFor="bt-market">
              <Select id="bt-market" value={draft.marketType} onValueChange={(v) => set({ marketType: v as BacktestParams["marketType"] })} options={MARKET_TYPES} />
            </Field>
            <Field label="Min EV %" htmlFor="bt-ev">
              <Input id="bt-ev" type="number" step={0.5} min={-10} max={30} value={text.minEv} onChange={(e) => setText((t) => ({ ...t, minEv: e.target.value }))} />
            </Field>
            <Field label="Min odds" htmlFor="bt-min">
              <Input id="bt-min" type="number" step="any" min={1.01} value={text.minOdds} onChange={(e) => setText((t) => ({ ...t, minOdds: e.target.value }))} />
            </Field>
            <Field label="Max odds" htmlFor="bt-max">
              <Input id="bt-max" type="number" step="any" min={1.01} value={text.maxOdds} onChange={(e) => setText((t) => ({ ...t, maxOdds: e.target.value }))} />
            </Field>
            <Field label="Staking" htmlFor="bt-stake">
              <Select
                id="bt-stake"
                value={draft.staking}
                onValueChange={(v) => set({ staking: v as BacktestParams["staking"] })}
                options={[
                  { value: "flat", label: "Flat 1u" },
                  { value: "proportional", label: "EV-scaled (≤3u)" },
                ]}
              />
            </Field>
            <div className="col-span-2 flex gap-2 md:col-span-3 xl:col-span-1">
              <Button type="submit" variant="primary" className="h-8 flex-1 whitespace-nowrap" disabled={!dirty}>
                Run backtest
              </Button>
              <Button
                variant="ghost"
                className="h-8"
                onClick={() => {
                  setDraft(DEFAULT_BACKTEST_PARAMS);
                  setText(toText(DEFAULT_BACKTEST_PARAMS));
                  setParams(DEFAULT_BACKTEST_PARAMS);
                }}
              >
                Reset
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {result.bets === 0 ? (
        <Card>
          <EmptyState title="No bets matched" message="Loosen the EV or odds constraints and run again." />
        </Card>
      ) : (
        <>
          <section aria-label="Backtest results" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <StatTile label="Bets" value={result.bets} hint={`${result.wins} won · ${formatPct(result.hitRate)}`} />
            <StatTile
              label="Profit"
              value={formatUnits(result.profit)}
              hint={`${result.staked.toFixed(0)}u staked`}
              valueClassName={result.profit >= 0 ? "text-pos" : "text-neg"}
            />
            <StatTile label="ROI" value={formatSignedPct(result.roi)} hint="Profit ÷ staked" />
            <StatTile label="Max drawdown" value={`${result.maxDrawdown.toFixed(1)}u`} hint={`Longest losing run ${result.longestLosingStreak}`} />
            <StatTile label="Avg. odds" value={formatOdds(result.averageOdds)} hint={`Avg. model EV ${formatSignedPct(result.averageEv)}`} />
            <StatTile label="Avg. CLV" value={formatSignedPct(result.averageClv)} hint="Taken price vs closing price" />
          </section>

          <div className="grid gap-5 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader title="Cumulative profit" subtitle="Units, bet by bet" />
              <CardBody>
                <LineChart
                  series={[{ id: "pl", label: "Profit (units)", values: result.equity.map((p) => Math.round(p.bankroll * 100) / 100) }]}
                  xLabels={result.equity.map((p) => p.date)}
                  references={[{ value: 0, label: "Break-even" }]}
                  formatY={(v) => `${v.toFixed(0)}u`}
                  height={260}
                  area
                  ariaLabel="Cumulative profit in units"
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Monthly P/L" subtitle="Units per month" />
              <CardBody>
                <BarChart
                  data={result.byMonth.map((m) => ({ label: MONTHS[Number(m.month.slice(5, 7)) - 1] ?? m.month, value: Math.round(m.profit * 10) / 10 }))}
                  signed
                  legend={{ above: "Profit", below: "Loss" }}
                  formatValue={(v) => `${v}`}
                  height={240}
                  ariaLabel="Monthly profit and loss in units"
                />
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader title="Most recent qualifying bets" subtitle="Last 40 bets that match the current rules" />
            <DataTable rows={recent} columns={columns} rowKey={(b) => b.id} dense caption="Recent bets" />
          </Card>
        </>
      )}
    </div>
  );
}
