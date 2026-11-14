import type { LucideIcon } from "lucide-react";
import {
  Activity, Archive, ArrowDownLeft, ArrowUpRight, BadgeCheck,
  Banknote, Bell, Building2, CalendarDays, Check, CheckCircle2,
  ClipboardCheck, Clock, Coins, CreditCard, FileCheck, FileText,
  Folder, Handshake, Home, LayoutDashboard, MapPin, Package,
  Pencil, Plus, Search, Settings, ShieldCheck, Trash2,
  TrendingUp, Users, Wallet, X, XCircle
} from "lucide-react";

export const KALEXI_ICON_MAP = {
  dashboard: LayoutDashboard,
  users: Users,
  clients: Users,
  property: Building2,
  home: Home,
  calendar: CalendarDays,
  deals: Handshake,
  finance: Wallet,
  payments: CreditCard,
  money: Banknote,
  gold: Coins,
  verification: ShieldCheck,
  compliance: BadgeCheck,
  documents: FileText,
  fileCheck: FileCheck,
  reception: Bell,
  operations: Settings,
  reports: TrendingUp,
  activity: Activity,
  archive: Archive,
  folder: Folder,
  location: MapPin,
  package: Package,
  search: Search,
  add: Plus,
  edit: Pencil,
  delete: Trash2,
  approve: CheckCircle2,
  reject: XCircle,
  check: Check,
  close: X,
  clock: Clock,
  incoming: ArrowDownLeft,
  outgoing: ArrowUpRight,
  clipboard: ClipboardCheck,
} as const;

export type KalexiIconName = keyof typeof KALEXI_ICON_MAP;

const COLORS: Record<KalexiIconName, string> = {
  dashboard: "#2563EB", users: "#0891B2", clients: "#0891B2",
  property: "#DB2777", home: "#DB2777", calendar: "#7C3AED",
  deals: "#16A34A", finance: "#D97706", payments: "#D97706",
  money: "#16A34A", gold: "#CA8A04", verification: "#9333EA",
  compliance: "#9333EA", documents: "#475569", fileCheck: "#16A34A",
  reception: "#0891B2", operations: "#64748B", reports: "#2563EB",
  activity: "#0891B2", archive: "#64748B", folder: "#D97706",
  location: "#DC2626", package: "#EA580C", search: "#64748B",
  add: "#16A34A", edit: "#2563EB", delete: "#DC2626",
  approve: "#16A34A", reject: "#DC2626", check: "#16A34A",
  close: "#DC2626", clock: "#D97706", incoming: "#16A34A",
  outgoing: "#DC2626", clipboard: "#2563EB",
};

export function KalexiIcon({
  name,
  size = 20,
  variant = "plain",
  className,
}: {
  name: KalexiIconName;
  size?: number;
  variant?: "plain" | "soft" | "filled";
  className?: string;
}) {
  const Icon = KALEXI_ICON_MAP[name];
  const color = COLORS[name];

  return (
    <span
      className={variant === "plain" ? `inline-flex shrink-0 ${className ?? ""}` : `inline-flex shrink-0 items-center justify-center rounded-xl ${className ?? ""}`}
      style={variant === "plain" ? undefined : {
        width: size + 18,
        height: size + 18,
        backgroundColor: variant === "filled" ? color : `${color}18`,
      }}
    >
      <Icon
        size={size}
        color={variant === "filled" ? "#FFFFFF" : color}
        strokeWidth={2.2}
        aria-hidden="true"
      />
    </span>
  );
}

export function KalexiPageHeading({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: KalexiIconName;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <KalexiIcon name={icon} size={25} variant="soft" />
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

export function KalexiSectionHeading({
  title,
  icon,
  children,
}: {
  title: string;
  icon: KalexiIconName;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <KalexiIcon name={icon} size={18} />
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  );
}