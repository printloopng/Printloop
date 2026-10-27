"use client";

import Link from "next/link";
import { useState } from "react";
import { Download } from "lucide-react";
import { Button, DataTable, ErrorState, PageHeader, Section, Segmented, Skeleton, StatCard, formatNaira, formatNumber } from "@printloop/ui";
import { errorMessage } from "@printloop/api-client";
import { useApi } from "@printloop/api-client/react";
import { downloadCsv } from "@printloop/auth/actions";

type Range = "7" | "30" | "90" | "365";

export function ReportsView() {
  const $api = useApi();
  const [days, setDays] = useState<Range>("30");
  const q = $api.useQuery("get", "/platform/reports/summary", { params: { query: { days: Number(days) } } });
  const s = q.data?.data;
  const shops = s?.shops ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Money"
        title="Reports"
        description="Sales, PrintLoop's commission and payouts for a period."
        actions={
          <>
            <Segmented
              label="Period"
              value={days}
              onChange={setDays}
              items={[
                { value: "7", label: "7d" },
                { value: "30", label: "30d" },
                { value: "90", label: "90d" },
                { value: "365", label: "1y" },
              ]}
            />
            <Button
              size="sm"
              variant="ghost"
              disabled={!shops.length}
              onClick={() =>
                downloadCsv(`printloop-shops-${days}d.csv`, [
                  ["Shop", "Handle", "Orders", "Sales (NGN)", "Commission (NGN)"],
                  ...shops.map((r) => [r.name, r.slug, r.transactions, r.gmv, r.commission]),
                ])
              }
            >
              <Download size={14} /> CSV
            </Button>
          </>
        }
      />
      {q.error ? <ErrorState message={errorMessage(q.error)} /> : null}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {s ? (
          <>
            <StatCard label="Gross sales (GMV)" value={formatNaira(s.gmv ?? 0)} tone="dark" />
            <StatCard label="Commission" value={formatNaira(s.commission ?? 0)} tone="accent" />
            <StatCard label="Paid orders" value={formatNumber(s.transactions ?? 0)} hint={s.transactions ? `Avg ${formatNaira((s.gmv ?? 0) / s.transactions)}` : undefined} />
          </>
        ) : (
          [0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)
        )}
      </div>

      <Section title="By shop">
        {q.isLoading ? (
          <Skeleton className="h-48" />
        ) : (
          <DataTable
            rows={shops}
            rowKey={(r) => String(r.tenantId)}
            empty="No sales in this period."
            columns={[
              { label: "Shop", cell: (r) => <Link href={`/tenants/${r.tenantId}`} className="pl-link font-semibold">{r.name ?? r.slug}</Link> },
              { label: "Orders", align: "right", cell: (r) => formatNumber(r.transactions ?? 0) },
              { label: "Sales", align: "right", cell: (r) => <span className="pl-mono">{formatNaira(r.gmv ?? 0)}</span> },
              { label: "Commission", align: "right", cell: (r) => <span className="pl-mono">{formatNaira(r.commission ?? 0)}</span> },
            ]}
          />
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Jobs by status">
          <DataTable
            rows={s?.jobsByStatus ?? []}
            rowKey={(r) => String(r.status)}
            empty="No jobs."
            columns={[
              { label: "Status", cell: (r) => <span className="capitalize">{String(r.status).replace(/_/g, " ")}</span> },
              { label: "Jobs", align: "right", cell: (r) => formatNumber(r.count ?? 0) },
            ]}
          />
        </Section>
        <Section title="Payouts by status">
          <DataTable
            rows={s?.payoutsByStatus ?? []}
            rowKey={(r) => String(r.status)}
            empty="No payouts."
            columns={[
              { label: "Status", cell: (r) => <span className="capitalize">{r.status}</span> },
              { label: "Count", align: "right", cell: (r) => formatNumber(r.count ?? 0) },
              { label: "Amount", align: "right", cell: (r) => <span className="pl-mono">{formatNaira(r.amount ?? 0)}</span> },
            ]}
          />
        </Section>
      </div>
    </div>
  );
}
