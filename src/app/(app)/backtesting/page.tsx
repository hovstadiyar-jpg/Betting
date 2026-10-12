import type { Metadata } from "next";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { DemoDataBanner } from "@/components/ui/DemoDataBanner";
import { BacktestRunner } from "@/features/backtesting/BacktestRunner";

export const metadata: Metadata = { title: "Backtesting" };

export default async function BacktestingPage() {
  const [reference, history] = await Promise.all([api.getReferenceData(), api.getHistoricalBets()]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Backtesting"
        description="Test a staking rule against historical model picks: hit rate, ROI, drawdown and closing-line value."
        eyebrow={<Badge tone="warning">Demo data · {history.data.length} synthetic historical bets</Badge>}
      />
      <DemoDataBanner>
        The bet history used here is randomly generated, so results only demonstrate how the tool works. They say nothing about how any real strategy would
        perform. Backtests of real data are also prone to overfitting, and past results do not predict future returns.
      </DemoDataBanner>
      <BacktestRunner history={history.data} reference={reference} />
    </div>
  );
}
