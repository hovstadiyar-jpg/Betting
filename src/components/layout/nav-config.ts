import {
  Activity,
  CreditCard,
  Crosshair,
  FlaskConical,
  History,
  LayoutDashboard,
  Radar,
  Shield,
  UserRound,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Markets",
    items: [
      { href: "/value-scanner", label: "Value Scanner", icon: Radar },
      { href: "/props-lab", label: "Bet365 Props Lab", icon: FlaskConical, badge: "Demo" },
      { href: "/match-analyzer", label: "Match Analyzer", icon: Crosshair },
      { href: "/odds-movement", label: "Odds Movement", icon: Activity },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { href: "/players", label: "Player Intelligence", icon: UserRound },
      { href: "/teams", label: "Team Intelligence", icon: Shield },
    ],
  },
  {
    label: "Research",
    items: [{ href: "/backtesting", label: "Backtesting", icon: History }],
  },
  {
    label: "Account",
    items: [{ href: "/pricing", label: "Pricing", icon: CreditCard }],
  },
];
