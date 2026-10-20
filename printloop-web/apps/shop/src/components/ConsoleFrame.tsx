"use client";

import type { ReactNode } from "react";
import {
  BarChart3,
  Banknote,
  BookOpen,
  FileEdit,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  Printer,
  ScrollText,
  Settings,
  ShieldAlert,
  Tags,
  UserCog,
  Users,
} from "lucide-react";
import { ConsoleShell, Segmented, Wordmark, initials, toast, type ConsoleNavGroup } from "@printloop/ui";
import { errorMessage, unwrap } from "@printloop/api-client";
import { useApi, useApiClient, useQueryClient } from "@printloop/api-client/react";
import { signOut } from "@printloop/auth/client";
import type { SessionUser } from "@printloop/auth/config";
import { ShopProfileProvider, useShopProfile, type ShopProfile } from "@/lib/shop-context";

function QueueBadge() {
  const $api = useApi();
  const q = $api.useQuery("get", "/saas/ops/summary", {}, { refetchInterval: 20_000 });
  const n = q.data?.data?.activeJobs ?? 0;
  return n ? <span className="pl-mono text-[11px] bg-paper text-ink px-1.5">{n}</span> : null;
}

function EditBadge() {
  const $api = useApi();
  const q = $api.useQuery("get", "/saas/edit-queue", { params: { query: { status: "pending_shop" } } }, { refetchInterval: 30_000 });
  const n = q.data?.data?.items?.length ?? 0;
  return n ? <span className="pl-mono text-[11px] bg-ochre text-paper px-1.5">{n}</span> : null;
}

function navGroups(): ConsoleNavGroup[] {
  return [
    {
      items: [
        { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
        { href: "/queue", label: "Job queue", icon: ListOrdered, badge: <QueueBadge /> },
        { href: "/edits", label: "Edit & Print", icon: FileEdit, badge: <EditBadge /> },
        { href: "/kiosks", label: "Kiosks", icon: Printer },
      ],
    },
    {
      label: "Business",
      items: [
        { href: "/money", label: "Money", icon: Banknote },
        { href: "/customers", label: "Customers", icon: Users },
        { href: "/disputes", label: "Disputes", icon: ShieldAlert },
        { href: "/reports", label: "Reports", icon: BarChart3 },
      ],
    },
    {
      label: "Setup",
      items: [
        { href: "/catalogue", label: "Prices & promos", icon: Tags },
        { href: "/team", label: "Team", icon: UserCog },
        { href: "/settings", label: "Settings", icon: Settings },
        { href: "/audit", label: "Audit log", icon: ScrollText },
        { href: "/guide", label: "Setup guide", icon: BookOpen },
      ],
    },
  ];
}

function Availability() {
  const shop = useShopProfile();
  const client = useApiClient();
  const qc = useQueryClient();
  const set = async (availability: "open" | "busy" | "closed") => {
    try {
      await unwrap(client.PATCH("/saas/me/availability", { body: { availability } }));
      await qc.invalidateQueries({ queryKey: ["get", "/saas/me"] });
      toast.success(availability === "open" ? "Open for orders." : availability === "busy" ? "Marked busy. Still taking orders." : "Closed. New uploads are paused.");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  return (
    <Segmented
      label="Shop availability"
      value={shop.availability}
      onChange={set}
      items={[
        { value: "open", label: "Open" },
        { value: "busy", label: "Busy" },
        { value: "closed", label: "Closed" },
      ]}
    />
  );
}

function Frame({ user, impersonating, children }: { user: SessionUser; impersonating: boolean; children: ReactNode }) {
  const shop = useShopProfile();
  return (
    <ConsoleShell
      brand={
        <span className="flex flex-col leading-tight">
          <Wordmark className="text-paper text-[19px]" />
          <span className="text-[11px] text-paper/50 truncate max-w-[12rem]">{shop.name}</span>
        </span>
      }
      groups={navGroups()}
      banner={
        impersonating ? (
          <div className="bg-persimmon text-paper text-sm px-4 py-2 flex items-center justify-between gap-3">
            <span>
              <strong>Support mode.</strong> You are signed in to {shop.name} as PrintLoop staff. Every action is audited.
            </span>
            <button type="button" className="underline font-bold" onClick={() => signOut("/login")}>
              End session
            </button>
          </div>
        ) : null
      }
      topbar={
        <>
          <div className="hidden sm:block">
            <Availability />
          </div>
          <span className="hidden md:inline text-xs text-fog capitalize">{shop.myRole ?? "staff"}</span>
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
      <div className="sm:hidden mb-5">
        <Availability />
      </div>
      {children}
    </ConsoleShell>
  );
}

export function ConsoleFrame({
  user,
  shop,
  impersonating,
  children,
}: {
  user: SessionUser;
  shop: ShopProfile;
  impersonating: boolean;
  children: ReactNode;
}) {
  return (
    <ShopProfileProvider initial={shop}>
      <Frame user={user} impersonating={impersonating}>
        {children}
      </Frame>
    </ShopProfileProvider>
  );
}
