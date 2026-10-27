"use client";

import Link from "next/link";
import { useState } from "react";
import { DataTable, ErrorState, PageHeader, Pagination, Pill, Skeleton, Tabs, formatDateTime, formatNaira } from "@printloop/ui";
import { errorMessage, type Schemas } from "@printloop/api-client";
import { useApi } from "@printloop/api-client/react";
import type { PayoutFilter } from "./filters";

type Payout = Schemas["Payout"];
const TONE = { pending: "ochre", processing: "ink", paid: "sage", failed: "persimmon", cancelled: "fog" } as const;

export function PayoutsView({ initial }: { initial: PayoutFilter }) {
  const $api = useApi();
  const [status, setStatus] = useState<PayoutFilter>(initial);
  const [page, setPage] = useState(1);
  const q = $api.useQuery("get", "/platform/payouts", { params: { query: { page, limit: 25, status: status === "all" ? undefined : status } } });
  const d = q.data?.data;

  return (
    <div>
      <PageHeader kicker="Money" title="Payouts" description="Transfers from PrintLoop to shops. Failed ones need a human." />
      <Tabs
        value={status}
        onChange={(s) => {
          setStatus(s);
          setPage(1);
        }}
        items={[
          { value: "all", label: "All" },
          { value: "pending", label: "Pending" },
          { value: "processing", label: "Processing" },
          { value: "paid", label: "Paid" },
          { value: "failed", label: "Failed" },
        ]}
      />
      {q.error ? (
        <ErrorState message={errorMessage(q.error)} />
      ) : q.isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <DataTable<Payout>
            rows={d?.payouts ?? []}
            rowKey={(p) => p.id}
            empty="No payouts."
            columns={[
              { label: "Requested", cell: (p) => <span className="text-xs">{p.requestedAt || p.createdAt ? formatDateTime((p.requestedAt ?? p.createdAt)!) : "—"}</span> },
              { label: "Shop", cell: (p) => (p.tenant?.id ? <Link href={`/tenants/${p.tenant.id}`} className="pl-link font-semibold">{p.tenant.name}</Link> : "—") },
              { label: "Amount", align: "right", cell: (p) => <span className="pl-mono">{formatNaira(p.amount)}</span> },
              { label: "Fee", hideOnMobile: true, align: "right", cell: (p) => <span className="pl-mono text-fog">{formatNaira(p.feeAmount ?? 0)}</span> },
              {
                label: "Status",
                cell: (p) => (
                  <div>
                    <Pill tone={TONE[p.status]}>{p.status}</Pill>
                    {p.failureReason ? <div className="text-xs text-persimmon mt-1 max-w-xs">{p.failureReason}</div> : null}
                  </div>
                ),
              },
              { label: "Reference", hideOnMobile: true, cell: (p) => <span className="pl-mono text-[11px] text-fog">{p.paystackTransferReference ?? "—"}</span> },
            ]}
          />
          <Pagination page={page} pages={d?.totalPages ?? 1} onPage={setPage} />
        </>
      )}
    </div>
  );
}
