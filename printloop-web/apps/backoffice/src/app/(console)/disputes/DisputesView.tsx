"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, DataTable, Dialog, ErrorState, KeyValue, PageHeader, Pagination, Pill, Skeleton, Tabs, Textarea, formatDateTime, timeAgo } from "@printloop/ui";
import { errorMessage, unwrap, type Schemas } from "@printloop/api-client";
import { useApi, useApiClient } from "@printloop/api-client/react";
import { useAction } from "@printloop/auth/actions";

type Dispute = Schemas["Dispute"];
type Filter = "pending" | "resolved" | "rejected";
const TONE = { pending: "ochre", resolved: "sage", rejected: "fog" } as const;

export function DisputesView() {
  const $api = useApi();
  const client = useApiClient();
  const { run, isPending } = useAction();
  const [status, setStatus] = useState<Filter>("pending");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Dispute | null>(null);
  const [notes, setNotes] = useState("");
  const q = $api.useQuery("get", "/platform/disputes", { params: { query: { status, page, limit: 25 } } }, { refetchInterval: 60_000 });
  const d = q.data?.data;

  const resolve = (outcome: "resolved" | "rejected") =>
    run(outcome, () => unwrap(client.POST("/platform/disputes/{id}/resolve", { params: { path: { id: open!.id } }, body: { status: outcome, resolutionNotes: notes.trim() || undefined } })), {
      success: outcome === "resolved" ? "Resolved." : "Rejected.",
      invalidate: ["/platform/disputes"],
    }).then((r) => {
      if (r) {
        setOpen(null);
        setNotes("");
      }
    });

  return (
    <div>
      <PageHeader kicker="Trust" title="Disputes" description="Problems customers reported, across every shop. Shops handle their own first; step in when they can't or won't." />
      <Tabs
        value={status}
        onChange={(s) => {
          setStatus(s);
          setPage(1);
        }}
        items={[
          { value: "pending", label: "Open" },
          { value: "resolved", label: "Resolved" },
          { value: "rejected", label: "Rejected" },
        ]}
      />
      {q.error ? (
        <ErrorState message={errorMessage(q.error)} />
      ) : q.isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <DataTable<Dispute>
            rows={d?.disputes ?? []}
            rowKey={(x) => x.id}
            onRowClick={setOpen}
            empty={status === "pending" ? "No open disputes." : "Nothing here."}
            columns={[
              { label: "Raised", cell: (x) => (x.createdAt ? timeAgo(x.createdAt) : "—") },
              { label: "Shop", cell: (x) => x.tenant?.name ?? "—" },
              { label: "Customer", hideOnMobile: true, cell: (x) => (x.user ? `${x.user.firstName ?? ""} ${x.user.lastName ?? ""}` : "—") },
              { label: "Problem", cell: (x) => <span className="line-clamp-2 max-w-md">{x.reason}</span> },
              { label: "Status", cell: (x) => <Pill tone={TONE[x.status]}>{x.status}</Pill> },
            ]}
          />
          <Pagination page={page} pages={d?.totalPages ?? 1} onPage={setPage} />
        </>
      )}
      <Dialog
        open={Boolean(open)}
        onOpenChange={(o) => !o && setOpen(null)}
        title="Dispute"
        description={open?.createdAt ? `Raised ${formatDateTime(open.createdAt)}` : undefined}
        footer={
          open?.status === "pending" ? (
            <>
              <Button size="sm" variant="ghost" loading={isPending("rejected")} onClick={() => resolve("rejected")}>
                Reject
              </Button>
              <Button size="sm" loading={isPending("resolved")} onClick={() => resolve("resolved")}>
                Mark resolved
              </Button>
            </>
          ) : null
        }
      >
        {open ? (
          <div className="space-y-4">
            <p className="font-serif text-lg">{open.reason}</p>
            <KeyValue
              items={[
                ["Shop", open.tenant?.id ? <Link key="s" href={`/tenants/${open.tenant.id}`} className="pl-link">{open.tenant.name}</Link> : "—"],
                ["Customer", open.user ? <Link key="c" href={`/users/${open.user.id}`} className="pl-link">{open.user.email}</Link> : "—"],
                ["Job", <span key="j" className="pl-mono text-xs">{open.printJobId}</span>],
                ["Outcome", open.resolutionNotes ?? "—"],
              ]}
            />
            {open.status === "pending" ? <Textarea label="What was decided? (the customer sees this)" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /> : null}
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
