"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { BarChart, Button, Card, DataTable, EmptyState, ErrorState, PageHeader, Section, Segmented, Skeleton, StatCard, formatNaira } from "@printloop/ui";
import { errorMessage } from "@printloop/api-client";
import { useApi } from "@printloop/api-client/react";
import { downloadFromApi } from "@/lib/download";
import { useCanManage } from "@/lib/shop-context";

type Range = "7" | "30" | "90" | "365";

export function ReportsView() {
  const $api = useApi();
  const manage = useCanManage();
  const [days, setDays] = useState<Range>("30");
  const revenue = $api.useQuery("get", "/saas/reports/revenue", { params: { query: { days: Number(days) } } }, { enabled: manage });
  const kiosks = $api.useQuery("get", "/saas/reports/kiosks", {}, { enabled: manage });

  if (!manage) return <EmptyState title="Reports are for owners and admins" description="Ask your shop owner if you need these numbers." />;

  const rows = revenue.data?.data?.rows ?? [];
  const summary = revenue.data?.data?.summary;

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Business"
        title="Reports"
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
            <Button size="sm" variant="ghost" onClick={() => downloadFromApi(`/saas/reports/revenue?days=${days}&format=csv`, `revenue-${days}d.csv`)}>
              <Download size={14} /> CSV
            </Button>
          </>
        }
      />
      {revenue.error ? <ErrorState message={errorMessage(revenue.error)} /> : null}
      <div className="grid grid-cols-2 gap-3 max-w-xl">
        {summary ? (
          <>
            <StatCard label="Revenue" value={formatNaira(summary.totalRevenue)} tone="dark" />
            <StatCard label="Paid jobs" value={summary.totalTransactions ?? 0} />
          </>
        ) : (
          [0, 1].map((i) => <Skeleton key={i} className="h-28" />)
        )}
      </div>
      <Section title="Revenue by day">
        <Card>{revenue.isLoading ? <Skeleton className="h-40" /> : <BarChart label="Revenue by day" data={rows.map((r) => ({ label: String(r.date).slice(5, 10), value: Number(r.revenue) }))} />}</Card>
      </Section>
      <Section title="By kiosk" description="All time.">
        {kiosks.isLoading ? (
          <Skeleton className="h-40" />
        ) : (
          <DataTable
            rows={kiosks.data?.data?.kiosks ?? []}
            rowKey={(k) => String(k.kioskId)}
            empty="No kiosk activity yet."
            columns={[
              { label: "Kiosk", cell: (k) => <span className="font-semibold">{k.kioskName ?? "Unnamed"}</span> },
              { label: "Jobs", align: "right", cell: (k) => k.totalJobs ?? 0 },
              { label: "Pages", align: "right", cell: (k) => k.totalPages ?? 0 },
              { label: "Revenue", align: "right", cell: (k) => <span className="pl-mono">{formatNaira(k.revenue)}</span> },
            ]}
          />
        )}
      </Section>
    </div>
  );
}
