import {
  Banknote,
  Building2,
  CreditCard,
  LayoutDashboard,
  LineChart,
  Database,
  PiggyBank,
  Receipt,
  ReceiptText,
  RefreshCw,
  Settings,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Data Studio", href: "/data-studio", icon: Database },
    ],
  },
  {
    label: "Planning",
    items: [
      { label: "Income", href: "/income", icon: Banknote },
      { label: "Expenses", href: "/expenses", icon: Receipt },
      { label: "Properties", href: "/properties", icon: Building2 },
      { label: "Loans", href: "/loans", icon: CreditCard },
      { label: "Investments", href: "/investments", icon: TrendingUp },
      { label: "Retirement", href: "/retirement", icon: PiggyBank },
      { label: "Tax Planning", href: "/tax-planning", icon: ReceiptText },
    ],
  },
  {
    label: "Strategy",
    items: [
      { label: "Scenarios", href: "/scenarios", icon: Sparkles },
      { label: "Projections", href: "/projections", icon: LineChart },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Sync Center", href: "/sync", icon: RefreshCw },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

export const BRAND_ICON = Wallet;
