"use client";

import Link from "next/link";
import { Card, DataTable, ErrorState, Notice, PageHeader, Section, Skeleton, StatCard, formatNaira, formatNumber, timeAgo } from "@printloop/ui";
import { errorMessage } from "@printloop/api-client";
import { useApi } from "@printloop/api-client/react";

export function OverviewView() {
  const $api = useApi();
  const summary = $api.useQuery("get", "/platform/reports/summary", { params: { query: { days: 30 } } });
  const health = $api.useQuery("get", "/platform/reliability", {}, { refetchInterval: 60_000 });
  const disputes = $api.useQuery("get", "/platform/disputes", { params: { query: { status: "pending", limit: 1 } } });
  const payouts = $api.useQuery("get", "/platform/payouts", { params: { query: { status: "failed", limit: 1 } } });
  const audit = $api.useQuery("get", "/platform/audit-logs", { params: { query: { limit: 8 } } });

  const s = summary.data?.data;
  const h = health.data?.data;
  const openDisputes = disputes.data?.data?.total ?? 0;
  const failedPayouts = payouts.data?.data?.total ?? 0;

  return (
    <div className="space-y-8">
      <PageHeader kicker="Last 30 days" title="Overview" description="How the network is doing right now." />
      {summary.error ? <ErrorState message={errorMessage(summary.error)} /> : null}

      {openDisputes || failedPayouts ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {openDisputes ? (
            <Notice tone="warn" title={`${openDisputes} open ${openDisputes === 1 ? "dispute" : "disputes"}`} action={<Link href="/disputes" className="pl-btn-primary pl-btn-sm">Review</Link>}>
              Customers are waiting for an answer.
            </Notice>
          ) : null}
          {failedPayouts ? (
            <Notice tone="danger" title={`${failedPayouts} failed ${failedPayouts === 1 ? "payout" : "payouts"}`} action={<Link href="/payouts?status=failed" className="pl-btn-primary pl-btn-sm">Look into it</Link>}>
              A shop&apos;s transfer didn&apos;t go through.
            </Notice>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {s ? (
          <>
            <StatCard label="Gross sales (GMV)" value={formatNaira(s.gmv ?? 0)} tone="dark" />
            <StatCard label="PrintLoop commission" value={formatNaira(s.commission ?? 0)} tone="accent" />
            <StatCard label="Paid orders" value={formatNumber(s.transactions ?? 0)} />
            <StatCard label="Active shops" value={formatNumber(s.shops?.length ?? 0)} hint="with sales in this period" />
          </>
        ) : (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Platform health" description="Live, refreshed every minute.">
          {health.isLoading ? (
            <Skeleton className="h-40" />
          ) : h ? (
            <Card className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="font-serif text-3xl font-bold">{h.agentUptime.onlineRatePct.toFixed(0)}%</div>
                <div className="editorial-label mt-1">Kiosks online</div>
                <div className="text-xs text-fog">
                  {h.agentUptime.onlineKiosksCount} of {h.agentUptime.totalActiveKiosks}
                </div>
              </div>
              <div>
                <div className="font-serif text-3xl font-bold">{h.jobSuccessRate.successRatePct.toFixed(1)}%</div>
                <div className="editorial-label mt-1">Jobs succeed</div>
                <div className="text-xs text-fog">{formatNumber(h.jobSuccessRate.failedJobsCount)} failed</div>
              </div>
              <div>
                <div className="font-serif text-3xl font-bold">{h.paidUnredeemed.totalPaidUnredeemed}</div>
                <div className="editorial-label mt-1">Paid, not printed</div>
                <div className="text-xs text-fog">in the pipeline now</div>
              </div>
            </Card>
          ) : null}
        </Section>

        <Section title="Top shops" description="By sales in the last 30 days.">
          <DataTable
            rows={(s?.shops ?? []).slice(0, 5)}
            rowKey={(r) => String(r.tenantId)}
            empty="No sales yet."
            columns={[
              { label: "Shop", cell: (r) => <Link href={`/tenants/${r.tenantId}`} className="pl-link font-semibold">{r.name ?? r.slug}</Link> },
              { label: "Orders", align: "right", cell: (r) => r.transactions ?? 0 },
              { label: "Sales", align: "right", cell: (r) => <span className="pl-mono">{formatNaira(r.gmv ?? 0)}</span> },
            ]}
          />
        </Section>
      </div>

      <Section title="Latest activity" actions={<Link href="/audit" className="pl-link text-sm">All activity</Link>}>
        <DataTable
          rows={audit.data?.data?.logs ?? []}
          rowKey={(l) => l.id}
          empty="Nothing logged yet."
          columns={[
            { label: "When", cell: (l) => <span className="text-xs">{timeAgo(l.createdAt)}</span> },
            { label: "Who", cell: (l) => l.actorName ?? "System" },
            { label: "Action", cell: (l) => <span className="pl-mono text-xs">{l.action}</span> },
          ]}
        />
      </Section>
    </div>
  );
}
