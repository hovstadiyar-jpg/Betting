import type { Metadata } from "next";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Pricing" };

interface Plan {
  id: string;
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  highlighted?: boolean;
}

const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    price: "€0",
    period: "forever",
    description: "Explore the platform with delayed data and core tools.",
    features: ["Value Scanner (top 10, delayed)", "Match Analyzer", "Team & player profiles", "7-day odds history"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "€29",
    period: "per month",
    description: "Full analytics suite for individual researchers.",
    features: ["Real-time Value Scanner", "Full Props Lab", "Trend Explorer & matchups", "Backtesting (12 months)", "Custom alerts"],
    highlighted: true,
  },
  {
    id: "team",
    name: "Team",
    price: "€99",
    period: "per month",
    description: "Shared workspaces and data export for analyst teams.",
    features: ["Everything in Pro", "5 seats", "CSV / API export", "Backtesting (full history)", "Priority support"],
  },
];

const MATRIX: Array<{ feature: string; values: [boolean | string, boolean | string, boolean | string] }> = [
  { feature: "Odds comparison", values: ["Delayed", "Real-time", "Real-time"] },
  { feature: "Expected value scanner", values: ["Top 10", true, true] },
  { feature: "Props Lab", values: [false, true, true] },
  { feature: "Line movement history", values: ["7 days", "90 days", "Full"] },
  { feature: "Backtesting", values: [false, "12 months", "Full history"] },
  { feature: "Alerts", values: [false, true, true] },
  { feature: "Data export", values: [false, false, true] },
  { feature: "Seats", values: ["1", "1", "5"] },
];

function Cell({ value }: { value: boolean | string }) {
  if (value === true) return <Check aria-label="Included" className="mx-auto size-4 text-pos" />;
  if (value === false) return <Minus aria-label="Not included" className="mx-auto size-4 text-ink-3" />;
  return <span className="text-ink-2">{value}</span>;
}

export default function PricingPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Pricing"
        description="Plans for researchers and analyst teams. BettingValue is an analytics product. It does not take bets or hold funds."
        eyebrow={<Badge tone="warning">Illustrative pricing · billing not enabled</Badge>}
      />

      <div className="rounded-md border border-line bg-surface px-4 py-3 text-xs leading-5 text-ink-3">
        Phase 1 preview: plans, prices and features shown here are placeholders for product design. No payments can be made and no subscriptions are created.
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {PLANS.map((plan) => (
          <Card key={plan.id} className={cn("relative flex flex-col p-6", plan.highlighted && "border-accent/60 ring-1 ring-accent/30")}>
            {plan.highlighted ? (
              <Badge tone="accent" className="absolute right-4 top-4">
                Most popular
              </Badge>
            ) : null}
            <h2 className="text-sm font-semibold text-ink">{plan.name}</h2>
            <p className="mt-1 min-h-10 text-xs text-ink-3">{plan.description}</p>
            <div className="mt-5 flex items-baseline gap-1.5">
              <span className="text-3xl font-semibold tracking-tight text-ink">{plan.price}</span>
              <span className="text-xs text-ink-3">{plan.period}</span>
            </div>
            <ul className="mt-5 flex-1 space-y-2">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-[13px] text-ink-2">
                  <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-accent" />
                  {f}
                </li>
              ))}
            </ul>
            <Button variant={plan.highlighted ? "primary" : "secondary"} className="mt-6 w-full" disabled title="Billing is not available in Phase 1">
              Coming soon
            </Button>
          </Card>
        ))}
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <caption className="sr-only">Plan comparison</caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-ink-3">
                  Feature
                </th>
                {PLANS.map((p) => (
                  <th key={p.id} scope="col" className="px-4 py-3 text-center text-[11px] font-medium uppercase tracking-wider text-ink-3">
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MATRIX.map((row) => (
                <tr key={row.feature} className="border-b border-line/70 last:border-0">
                  <th scope="row" className="px-4 py-2.5 text-left font-normal text-ink">
                    {row.feature}
                  </th>
                  {row.values.map((v, i) => (
                    <td key={i} className="px-4 py-2.5 text-center">
                      <Cell value={v} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-[11px] leading-5 text-ink-3">
        BettingValue provides statistical analysis for information and research. It is not a bookmaker, does not accept wagers and does not provide financial or
        betting advice. Users are responsible for complying with the laws of their jurisdiction. 18+ only. If gambling is causing you harm, contact a local
        support service.
      </p>
    </div>
  );
}
