"use client";

import Link from "next/link";
import { Check, Circle, Wifi, WifiOff } from "lucide-react";
import {
  BarChart,
  Card,
  ErrorState,
  PageHeader,
  Pill,
  Section,
  Skeleton,
  StatCard,
  StatusPill,
  cx,
  formatNaira,
  timeAgo,
} from "@printloop/ui";
import { errorMessage } from "@printloop/api-client";
import { useApi } from "@printloop/api-client/react";
import { useShopProfile } from "@/lib/shop-context";

function Checklist() {
  const shop = useShopProfile();
  const $api = useApi();
  const ops = $api.useQuery("get", "/saas/ops/summary", {}, { refetchInterval: 20_000 });
  const gate = ops.data?.data?.liveGate;
  if (!gate || ops.data?.data?.liveGateMet) return null;
  const steps = [
    { done: gate.statusActive, label: "Verify your email", href: "/settings" },
    { done: shop.onboarding.brandingSet, label: "Add your logo and colours", href: "/settings?tab=branding" },
    { done: gate.locationSet, label: "Pin your shop on the map", href: "/settings?tab=location" },
    { done: shop.onboarding.bankAccountSet || shop.onboarding.subaccountSet, label: "Add a payout bank account", href: "/settings?tab=payouts" },
    { done: gate.kioskOnline, label: "Connect a printer (kiosk app)", href: "/kiosks" },
    { done: gate.testPrintDone, label: "Print a test page", href: "/kiosks" },
  ];
  const left = steps.filter((s) => !s.done).length;
  return (
    <Card className="border-persimmon">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-4">
        <div>
          <div className="editorial-label text-persimmon">Go live</div>
          <h2 className="font-serif text-2xl font-bold">
            {left} step{left === 1 ? "" : "s"} until students can find you
          </h2>
        </div>
        <span className="pl-mono text-sm text-ink/60">
          {steps.length - left}/{steps.length}
        </span>
      </div>
      <ol className="grid sm:grid-cols-2 gap-2">
        {steps.map((s) => (
          <li key={s.label}>
            <Link
              href={s.href}
              className={cx("flex items-center gap-3 border-2 p-3 text-sm font-semibold transition-colors", s.done ? "border-ink/15 text-ink/50" : "border-ink hover:bg-paper-warm")}
            >
              <span className={cx("h-6 w-6 grid place-items-center border-2 shrink-0", s.done ? "bg-sage border-sage text-paper" : "border-ink")}>
                {s.done ? <Check size={14} /> : <Circle size={8} />}
              </span>
              <span className={cx(s.done && "line-through")}>{s.label}</span>
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}

export function DashboardView() {
  const shop = useShopProfile();
  const $api = useApi();
  const ops = $api.useQuery("get", "/saas/ops/summary", {}, { refetchInterval: 20_000 });
  const stats = $api.useQuery("get", "/saas/dashboard/stats", {}, { refetchInterval: 60_000 });
  const jobs = $api.useQuery("get", "/saas/jobs", { params: { query: { limit: 6 } } }, { refetchInterval: 15_000 });
  const o = ops.data?.data;
  const s = stats.data?.data;

  return (
    <div className="space-y-8">
      <PageHeader kicker={shop.name} title="Today at the shop" description="Live orders, printers and money in one place." />
      <Checklist />
      {ops.error ? <ErrorState message={errorMessage(ops.error)} /> : null}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {o ? (
          <>
            <StatCard label="Revenue today" value={formatNaira(o.revenueTodayGross)} hint={`${formatNaira(o.commissionTodayPaid ?? 0)} commission`} tone="dark" />
            <StatCard label="Jobs today" value={o.jobsToday} />
            <StatCard label="In the queue" value={o.activeJobs} tone={o.activeJobs ? "accent" : "default"} />
            <StatCard label="Printers online" value={`${o.onlineCount}/${o.kioskCount}`} hint={o.stuckRenders ? `${o.stuckRenders} stuck renders` : undefined} />
          </>
        ) : (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)
        )}
      </div>

      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-6 items-start">
        <Section title="Revenue, last 30 days" description={s ? `${formatNaira(s.revenue.thisMonth)} this month · ${formatNaira(s.revenue.allTime)} all time` : undefined}>
          <Card>
            {s ? (
              <BarChart label="Revenue by day" data={(s.revenue.byDay ?? []).slice(-30).map((d) => ({ label: d.date.slice(5), value: d.revenue }))} />
            ) : (
              <Skeleton className="h-40" />
            )}
          </Card>
        </Section>
        <Section title="Printers" actions={<Link href="/kiosks" className="pl-link text-sm">Manage</Link>}>
          <ul className="space-y-2">
            {(o?.kiosks ?? []).map((k) => (
              <li key={k.id} className="border-2 border-ink bg-paper-light p-3 flex items-center gap-3">
                {k.online ? <Wifi size={16} className="text-sage" /> : <WifiOff size={16} className="text-fog" />}
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">{k.name}</div>
                  <div className="text-xs text-fog">{k.lastSeenAt ? `Seen ${timeAgo(k.lastSeenAt)}` : "Never connected"}</div>
                </div>
                <Pill tone={k.online ? "sage" : "fog"}>{k.online ? "Online" : "Offline"}</Pill>
              </li>
            ))}
            {o && !o.kiosks.length ? <li className="text-sm text-fog">No printers yet. Add one under Kiosks.</li> : null}
          </ul>
        </Section>
      </div>

      <Section title="Latest jobs" actions={<Link href="/queue" className="pl-link text-sm">Open queue</Link>}>
        <ul className="divide-y-2 divide-ink/10 border-2 border-ink bg-paper-light">
          {(jobs.data?.data?.jobs ?? []).map((j) => (
            <li key={j.id} className="p-3 flex flex-wrap items-center gap-3 text-sm">
              <span className="pl-mono font-bold w-20">{j.code ?? "—"}</span>
              <span className="flex-1 min-w-0 truncate">{j.fileName ?? "Document"}</span>
              <span className="text-fog text-xs">
                {j.user ? `${j.user.firstName} ${j.user.lastName}` : "Guest"} · {timeAgo(j.createdAt)}
              </span>
              <StatusPill status={j.status} />
              <span className="pl-mono">{formatNaira(j.finalCost ?? j.cost)}</span>
            </li>
          ))}
          {jobs.data && !jobs.data.data?.jobs?.length ? <li className="p-4 text-sm text-fog">No jobs yet.</li> : null}
        </ul>
      </Section>
    </div>
  );
}
