"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import {
  Button,
  DataTable,
  Dialog,
  ErrorState,
  InlineLoader,
  KeyValue,
  PageHeader,
  Pagination,
  Pill,
  Skeleton,
  StatusPill,
  Textarea,
  formatDate,
  formatNaira,
  timeAgo,
} from "@printloop/ui";
import { errorMessage, unwrap, type Schemas } from "@printloop/api-client";
import { useApi, useApiClient } from "@printloop/api-client/react";
import { useAction } from "@/lib/actions";
import { useCanManage } from "@/lib/shop-context";

type Customer = Schemas["PublicUser"];

function CustomerDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const $api = useApi();
  const client = useApiClient();
  const manage = useCanManage();
  const { run, isPending } = useAction();
  const [reason, setReason] = useState("");
  const q = $api.useQuery("get", "/saas/customers/{id}", { params: { path: { id: id ?? "" } } }, { enabled: Boolean(id) });
  const d = q.data?.data;
  const c = d?.customer;
  const block = (isBlocked: boolean) =>
    run(
      "block",
      () => unwrap(client.PATCH("/saas/customers/{id}/block", { params: { path: { id: id! } }, body: { isBlocked, reason: reason.trim() || undefined } })),
      { success: isBlocked ? "Customer blocked." : "Customer unblocked.", invalidate: ["/saas/customers/{id}", "/saas/customers"] },
    );
  return (
    <Dialog
      open={Boolean(id)}
      onOpenChange={(o) => !o && onClose()}
      title={c ? `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || c.email : "Customer"}
      description={c?.email}
      footer={
        manage && c ? (
          c.isBlocked ? (
            <Button size="sm" variant="ghost" loading={isPending("block")} onClick={() => block(false)}>
              Unblock
            </Button>
          ) : (
            <Button size="sm" loading={isPending("block")} onClick={() => block(true)}>
              Block customer
            </Button>
          )
        ) : null
      }
    >
      {q.isLoading ? (
        <InlineLoader />
      ) : c ? (
        <div className="space-y-5">
          <KeyValue
            items={[
              ["Phone", c.phoneNumber ?? "—"],
              ["Joined", formatDate(c.createdAt)],
              ["Last sign-in", timeAgo(c.lastLoginAt)],
              ["Jobs", String(d?.stats?.totalJobs ?? 0)],
              ["Spent", formatNaira(d?.stats?.totalSpent ?? 0)],
              ["Status", c.isBlocked ? `Blocked${c.blockReason ? ` · ${c.blockReason}` : ""}` : "Active"],
            ]}
          />
          {manage && !c.isBlocked ? <Textarea label="Reason (if blocking)" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /> : null}
          {d?.recentJobs?.length ? (
            <div>
              <div className="editorial-label mb-2">Recent jobs</div>
              <ul className="divide-y divide-ink/10 border-2 border-ink/15">
                {(d.recentJobs as Array<{ id: string; fileName?: string; status: string; cost: number; createdAt: string }>).map((j) => (
                  <li key={j.id} className="p-2 flex items-center gap-2 text-sm">
                    <span className="flex-1 truncate">{j.fileName ?? "Document"}</span>
                    <StatusPill status={j.status} />
                    <span className="pl-mono">{formatNaira(j.cost)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <ErrorState message={errorMessage(q.error)} />
      )}
    </Dialog>
  );
}

export function CustomersView() {
  const $api = useApi();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const q = $api.useQuery("get", "/saas/customers", { params: { query: { page, limit: 25, search: search.trim() || undefined } } });
  const d = q.data?.data;
  return (
    <div>
      <PageHeader kicker="Business" title="Customers" description="People who registered through your shop." />
      <label className="relative block max-w-sm mb-5">
        <span className="sr-only">Search customers</span>
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-fog" />
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Name, email or phone"
          className="pl-input pl-9"
        />
      </label>
      {q.error ? (
        <ErrorState message={errorMessage(q.error)} />
      ) : q.isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <DataTable<Customer>
            rows={d?.customers ?? []}
            rowKey={(c) => c.id}
            onRowClick={(c) => setOpen(c.id)}
            empty="No customers yet."
            mobileTitle={(c) => `${c.firstName ?? ""} ${c.lastName ?? ""}`}
            columns={[
              { label: "Name", hideOnMobile: true, cell: (c) => <span className="font-semibold">{`${c.firstName ?? ""} ${c.lastName ?? ""}`}</span> },
              { label: "Email", cell: (c) => c.email },
              { label: "Phone", cell: (c) => c.phoneNumber ?? "—" },
              { label: "Joined", cell: (c) => formatDate(c.createdAt) },
              { label: "Status", cell: (c) => (c.isBlocked ? <Pill tone="persimmon">Blocked</Pill> : c.isEmailVerified ? <Pill tone="sage">Verified</Pill> : <Pill tone="fog">Unverified</Pill>) },
            ]}
          />
          <Pagination page={page} pages={d?.totalPages ?? 1} onPage={setPage} />
        </>
      )}
      <CustomerDialog id={open} onClose={() => setOpen(null)} />
    </div>
  );
}
