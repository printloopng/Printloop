"use client";

import Link from "next/link";
import { useState } from "react";
import { DataTable, ErrorState, PageHeader, Pagination, Skeleton, formatDateTime } from "@printloop/ui";
import { errorMessage, type Schemas } from "@printloop/api-client";
import { useApi } from "@printloop/api-client/react";

type Log = Schemas["AuditLog"];

export function AuditView() {
  const $api = useApi();
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const q = $api.useQuery("get", "/platform/audit-logs", {
    params: { query: { page, limit: 50, action: action.trim() || undefined, fromDate: from ? new Date(from).toISOString() : undefined, toDate: to ? new Date(`${to}T23:59:59`).toISOString() : undefined } },
  });
  const d = q.data?.data;
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  return (
    <div>
      <PageHeader kicker="Trust" title="Audit log" description="Every sensitive action across PrintLoop, including support sessions." />
      <div className="mb-5 flex flex-wrap gap-3 items-end">
        <label className="block">
          <span className="editorial-label block mb-1.5">Action</span>
          <input value={action} onChange={(e) => reset(setAction)(e.target.value)} placeholder="e.g. tenant.suspended" className="pl-input w-56" />
        </label>
        <label className="block">
          <span className="editorial-label block mb-1.5">From</span>
          <input type="date" value={from} max={to || undefined} onChange={(e) => reset(setFrom)(e.target.value)} className="pl-input" />
        </label>
        <label className="block">
          <span className="editorial-label block mb-1.5">To</span>
          <input type="date" value={to} min={from || undefined} onChange={(e) => reset(setTo)(e.target.value)} className="pl-input" />
        </label>
      </div>
      {q.error ? (
        <ErrorState message={errorMessage(q.error)} />
      ) : q.isLoading ? (
        <Skeleton className="h-72" />
      ) : (
        <>
          <DataTable<Log>
            rows={d?.logs ?? []}
            rowKey={(l) => l.id}
            empty="Nothing matches."
            columns={[
              { label: "When", cell: (l) => <span className="text-xs">{formatDateTime(l.createdAt)}</span> },
              { label: "Who", cell: (l) => l.actorId ? <Link href={`/users/${l.actorId}`} className="pl-link">{l.actorName ?? "Unknown"}</Link> : l.actorName ?? "System" },
              { label: "Action", cell: (l) => <span className="pl-mono text-xs">{l.action}</span> },
              { label: "Target", hideOnMobile: true, cell: (l) => <span className="pl-mono text-[11px] text-fog">{l.target}</span> },
              { label: "Shop", hideOnMobile: true, cell: (l) => (l.tenantId ? <Link href={`/tenants/${l.tenantId}`} className="pl-link text-xs">Open</Link> : <span className="text-fog">—</span>) },
              { label: "IP", hideOnMobile: true, cell: (l) => <span className="pl-mono text-[11px] text-fog">{l.ipAddress ?? "—"}</span> },
            ]}
          />
          <Pagination page={page} pages={d?.totalPages ?? 1} onPage={setPage} />
        </>
      )}
    </div>
  );
}
