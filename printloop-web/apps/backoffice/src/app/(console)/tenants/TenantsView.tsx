"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, DataTable, ErrorState, PageHeader, Pill, Skeleton, Tabs, formatDate } from "@printloop/ui";
import { errorMessage, type Schemas } from "@printloop/api-client";
import { useApi } from "@printloop/api-client/react";

type Tenant = Schemas["Tenant"];
type Status = "all" | "active" | "trial" | "suspended" | "closed";

export const TENANT_TONE = { active: "sage", trial: "ochre", suspended: "persimmon", closed: "fog" } as const;

export function TenantsView() {
  const $api = useApi();
  const router = useRouter();
  const [status, setStatus] = useState<Status>("all");
  const [search, setSearch] = useState("");
  const [cursors, setCursors] = useState<string[]>([]);
  const before = cursors.at(-1);
  const q = $api.useQuery("get", "/platform/tenants", { params: { query: { limit: 50, status: status === "all" ? undefined : status, before } } });
  const nextCursor = q.data?.data?.nextCursor ?? null;

  const rows = useMemo(() => {
    const items = q.data?.data?.items ?? [];
    const term = search.trim().toLowerCase();
    return term ? items.filter((t) => `${t.name} ${t.slug} ${t.customDomain ?? ""}`.toLowerCase().includes(term)) : items;
  }, [q.data, search]);

  const reset = (next: Status) => {
    setStatus(next);
    setCursors([]);
  };

  return (
    <div>
      <PageHeader kicker="Network" title="Shops" description="Every print shop on PrintLoop, newest first." />
      <Tabs
        value={status}
        onChange={reset}
        items={[
          { value: "all", label: "All" },
          { value: "active", label: "Active" },
          { value: "trial", label: "Trial" },
          { value: "suspended", label: "Suspended" },
          { value: "closed", label: "Closed" },
        ]}
      />
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter this page by name, handle or domain" aria-label="Filter shops" className="pl-input max-w-sm mb-5" />
      {q.error ? (
        <ErrorState message={errorMessage(q.error)} />
      ) : q.isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <DataTable<Tenant>
            rows={rows}
            rowKey={(t) => t.id}
            onRowClick={(t) => router.push(`/tenants/${t.id}`)}
            empty="No shops match."
            columns={[
              {
                label: "Shop",
                cell: (t) => (
                  <div>
                    <div className="font-semibold">{t.name}</div>
                    <div className="pl-mono text-[11px] text-fog">{t.customDomain ?? t.slug}</div>
                  </div>
                ),
              },
              { label: "Status", cell: (t) => <Pill tone={TENANT_TONE[t.status ?? "trial"]}>{t.status}</Pill> },
              { label: "Fee", hideOnMobile: true, align: "right", cell: (t) => `${((t.commissionPct ?? 0) * 100).toFixed(1)}%` },
              { label: "Payouts", hideOnMobile: true, cell: (t) => (t.paystackSubaccountCode ? "Split" : "Weekly") },
              { label: "Joined", hideOnMobile: true, cell: (t) => (t.createdAt ? formatDate(t.createdAt) : "—") },
            ]}
          />
          <div className="mt-4 flex items-center justify-between">
            <Button size="sm" variant="ghost" disabled={!cursors.length} onClick={() => setCursors((c) => c.slice(0, -1))}>
              Newer
            </Button>
            <Button size="sm" variant="ghost" disabled={!nextCursor} onClick={() => nextCursor && setCursors((c) => [...c, nextCursor])}>
              Older
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
