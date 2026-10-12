import Link from "next/link";
import { BarChart3, FlaskConical, Radar } from "lucide-react";
import { Logo } from "@/components/layout/Logo";

const POINTS = [
  { icon: Radar, title: "Value Scanner", text: "Model fair prices against every tracked bookmaker." },
  { icon: FlaskConical, title: "Props Lab", text: "Player and team prop lines, hit rates and matchups." },
  { icon: BarChart3, title: "Backtesting", text: "Replay staking rules against historical picks." },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col px-4 py-6 sm:px-10">
        <Link href="/dashboard" aria-label="BettingValue home" className="w-fit">
          <Logo />
        </Link>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
        <p className="text-[11px] text-ink-3">Phase 1 preview · 18+ · Analytics only, no wagering.</p>
      </div>
      <aside className="hidden border-l border-line bg-surface lg:flex lg:flex-col lg:justify-center lg:px-14">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Sports betting analytics</p>
        <h2 className="mt-3 max-w-md text-2xl font-semibold leading-snug tracking-tight text-ink">Price every market like a trading desk.</h2>
        <ul className="mt-8 space-y-5">
          {POINTS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-line-strong bg-surface-2">
                <Icon aria-hidden className="size-4 text-accent" />
              </span>
              <span>
                <span className="block text-[13px] font-medium text-ink">{title}</span>
                <span className="block text-xs text-ink-3">{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
