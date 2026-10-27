"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DataTable, ErrorState, PageHeader, Pill, Skeleton, StatCard, Tabs, timeAgo } from "@printloop/ui";
import { errorMessage } from "@printloop/api-client";
import { useApi } from "@printloop/api-client/react";

type Filter = "all" | "online" | "offline";

export function KiosksView() {
  const $api = useApi();
  const [filter, setFilter] = useState<Filter>("all");
  const q = $api.useQuery("get", "/platform/kiosks", {}, { refetchInterval: 30_000 });
  const all = useMemo(() => q.data?.data?.kiosks ?? [], [q.data]);
  const online = all.filter((k) => k.online).length;
  const rows = all.filter((k) => (filter === "all" ? true : filter === "online" ? k.online : !k.online));

  return (
    <div>
      <PageHeader kicker="Network" title="Kiosk fleet" description="Every kiosk across every shop. Online means it checked in within the last few minutes." />
      <div className="grid grid-cols-3 gap-3 max-w-xl mb-6">
        <StatCard label="Kiosks" value={all.length} />
        <StatCard label="Online" value={online} tone="dark" />
        <StatCard label="Offline" value={all.length - online} />
      </div>
      <Tabs
        value={filter}
        onChange={setFilter}
        items={[
          { value: "all", label: "All", count: all.length },
          { value: "online", label: "Online", count: online },
          { value: "offline", label: "Offline", count: all.length - online },
        ]}
      />
      {q.error ? (
        <ErrorState message={errorMessage(q.error)} />
      ) : q.isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <DataTable
          rows={rows}
          rowKey={(k) => String(k.id)}
          empty="No kiosks here."
          columns={[
            {
              label: "Kiosk",
              cell: (k) => (
                <div>
                  <div className="font-semibold">{k.name}</div>
                  <div className="text-xs text-fog">{k.location ?? "No location"}</div>
                </div>
              ),
            },
            { label: "Shop", cell: (k) => (k.tenant?.id ? <Link href={`/tenants/${k.tenant.id}`} className="pl-link">{k.tenant.name}</Link> : "—") },
            { label: "Status", cell: (k) => <Pill tone={k.online ? "sage" : k.status === "DISABLED" ? "fog" : "persimmon"}>{k.online ? "Online" : k.status === "ACTIVE" ? "Offline" : String(k.status ?? "").toLowerCase()}</Pill> },
            { label: "Last seen", hideOnMobile: true, cell: (k) => (k.lastSeenAt ? timeAgo(k.lastSeenAt) : "Never") },
          ]}
        />
      )}
    </div>
  );
}
