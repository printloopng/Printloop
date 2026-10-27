"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Activity, BarChart3, Banknote, Building2, LayoutDashboard, LogOut, Newspaper, Printer, ScrollText, Settings, ShieldAlert, ShieldCheck, Users } from "lucide-react";
import { ConsoleShell, Wordmark, initials, type ConsoleNavGroup } from "@printloop/ui";
import { useApi } from "@printloop/api-client/react";
import { signOut } from "@printloop/auth/client";
import type { SessionUser } from "@printloop/auth/config";

function DisputeBadge() {
  const $api = useApi();
  const q = $api.useQuery("get", "/platform/disputes", { params: { query: { status: "pending", limit: 1 } } }, { refetchInterval: 60_000 });
  const n = q.data?.data?.total ?? 0;
  return n ? <span className="pl-mono text-[11px] bg-ochre text-paper px-1.5">{n}</span> : null;
}

const GROUPS: ConsoleNavGroup[] = [
  { items: [{ href: "/", label: "Overview", icon: LayoutDashboard, exact: true }] },
  {
    label: "Network",
    items: [
      { href: "/tenants", label: "Shops", icon: Building2 },
      { href: "/users", label: "People", icon: Users },
      { href: "/kiosks", label: "Kiosk fleet", icon: Printer },
    ],
  },
  {
    label: "Money",
    items: [
      { href: "/payouts", label: "Payouts", icon: Banknote },
      { href: "/reports", label: "Reports", icon: BarChart3 },
    ],
  },
  {
    label: "Trust",
    items: [
      { href: "/disputes", label: "Disputes", icon: ShieldAlert, badge: <DisputeBadge /> },
      { href: "/audit", label: "Audit log", icon: ScrollText },
    ],
  },
  { label: "Content", items: [{ href: "/blog", label: "Blog", icon: Newspaper }] },
  {
    label: "System",
    items: [
      { href: "/reliability", label: "Reliability", icon: Activity },
      { href: "/settings", label: "Settings", icon: Settings },
      { href: "/security", label: "My security", icon: ShieldCheck },
    ],
  },
];

export function ConsoleFrame({ user, warnNoTwoFactor, children }: { user: SessionUser; warnNoTwoFactor: boolean; children: ReactNode }) {
  return (
    <ConsoleShell
      brand={
        <span className="flex flex-col leading-tight">
          <Wordmark className="text-paper text-[19px]" />
          <span className="text-[11px] text-paper/50 tracking-widest">BACKOFFICE</span>
        </span>
      }
      groups={GROUPS}
      banner={
        warnNoTwoFactor ? (
          <div className="bg-ochre text-ink text-sm px-4 py-2">
            <strong>Two-step sign-in is off.</strong> In production this account would be locked out of the backoffice.{" "}
            <Link href="/security" className="underline font-bold">
              Turn it on
            </Link>
          </div>
        ) : null
      }
      topbar={
        <>
          <span className="hidden md:inline text-xs text-fog">{user.email}</span>
          <span className="h-9 w-9 grid place-items-center border-2 border-ink bg-ink text-paper text-sm font-bold" title={user.email}>
            {initials(user.firstName, user.lastName)}
          </span>
        </>
      }
      footer={
        <button type="button" onClick={() => signOut("/login")} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-paper/70 hover:text-paper">
          <LogOut size={16} /> Sign out
        </button>
      }
    >
      {children}
    </ConsoleShell>
  );
}
