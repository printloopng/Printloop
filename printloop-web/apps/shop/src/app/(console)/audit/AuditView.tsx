"use client";

import { useState } from "react";
import { DataTable, EmptyState, ErrorState, PageHeader, Pagination, Skeleton, formatDateTime } from "@printloop/ui";
import { errorMessage, type Schemas } from "@printloop/api-client";
import { useApi } from "@printloop/api-client/react";
import { useCanManage } from "@/lib/shop-context";

export function AuditView() {
  const $api = useApi();
  const manage = useCanManage();
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const q = $api.useQuery("get", "/saas/audit-logs", { params: { query: { page, limit: 50, action: action.trim() || undefined } } }, { enabled: manage });
  if (!manage) return <EmptyState title="The audit log is for owners and admins" />;
  const d = q.data?.data;
  return (
    <div>
      <PageHeader kicker="Setup" title="Audit log" description="Who changed what in your shop, and when." />
      <input
        value={action}
        onChange={(e) => {
          setAction(e.target.value);
          setPage(1);
        }}
        placeholder="Filter by action, e.g. kiosk.updated"
        className="pl-input max-w-sm mb-5"
        aria-label="Filter by action"
      />
      {q.error ? (
        <ErrorState message={errorMessage(q.error)} />
      ) : q.isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <DataTable<Schemas["AuditLog"]>
            rows={d?.logs ?? []}
            rowKey={(l) => l.id}
            empty="Nothing logged yet."
            columns={[
              { label: "When", cell: (l) => <span className="text-xs">{formatDateTime(l.createdAt)}</span> },
              { label: "Who", cell: (l) => l.actorName ?? "System" },
              { label: "Action", cell: (l) => <span className="pl-mono text-xs">{l.action}</span> },
              { label: "Target", hideOnMobile: true, cell: (l) => <span className="pl-mono text-[11px] text-fog">{l.target}</span> },
              { label: "IP", hideOnMobile: true, cell: (l) => <span className="pl-mono text-[11px] text-fog">{l.ipAddress ?? "—"}</span> },
            ]}
          />
          <Pagination page={page} pages={d?.totalPages ?? 1} onPage={setPage} />
        </>
      )}
    </div>
  );
}
