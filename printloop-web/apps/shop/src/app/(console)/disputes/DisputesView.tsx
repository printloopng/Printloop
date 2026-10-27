"use client";

import { useMemo, useState } from "react";
import { Button, DataTable, Dialog, ErrorState, KeyValue, PageHeader, Pill, Skeleton, Tabs, Textarea, formatDateTime, timeAgo } from "@printloop/ui";
import { errorMessage, unwrap, type Schemas } from "@printloop/api-client";
import { useApi, useApiClient } from "@printloop/api-client/react";
import { useAction } from "@printloop/auth/actions";
import { useCanManage } from "@/lib/shop-context";

type Dispute = Schemas["Dispute"];
const TONE = { pending: "ochre", resolved: "sage", rejected: "fog" } as const;

export function DisputesView() {
  const $api = useApi();
  const client = useApiClient();
  const manage = useCanManage();
  const { run, isPending } = useAction();
  const [tab, setTab] = useState<"pending" | "closed">("pending");
  const [open, setOpen] = useState<Dispute | null>(null);
  const [notes, setNotes] = useState("");
  const q = $api.useQuery("get", "/saas/disputes", {}, { refetchInterval: 30_000 });
  const all = useMemo(() => (q.data?.data ?? []) as Dispute[], [q.data]);
  const rows = all.filter((d) => (tab === "pending" ? d.status === "pending" : d.status !== "pending"));

  const resolve = (status: "resolved" | "rejected") =>
    run(
      status,
      () => unwrap(client.POST("/saas/disputes/{id}/resolve", { params: { path: { id: open!.id } }, body: { status, resolutionNotes: notes.trim() || undefined } })),
      { success: status === "resolved" ? "Resolved." : "Rejected.", invalidate: ["/saas/disputes"] },
    ).then((r) => {
      if (r) {
        setOpen(null);
        setNotes("");
      }
    });

  return (
    <div>
      <PageHeader kicker="Business" title="Disputes" description="Problems customers reported. Reprint, refund off-platform, or explain, then close them here." />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: "pending", label: "Open", count: all.filter((d) => d.status === "pending").length },
          { value: "closed", label: "Closed" },
        ]}
      />
      {q.error ? (
        <ErrorState message={errorMessage(q.error)} />
      ) : q.isLoading ? (
        <Skeleton className="h-48" />
      ) : (
        <DataTable<Dispute>
          rows={rows}
          rowKey={(d) => d.id}
          onRowClick={setOpen}
          empty={tab === "pending" ? "No open disputes. Nice." : "Nothing closed yet."}
          columns={[
            { label: "Raised", cell: (d) => timeAgo(d.createdAt) },
            { label: "Customer", cell: (d) => (d.user ? `${d.user.firstName ?? ""} ${d.user.lastName ?? ""}` : "—") },
            { label: "Problem", cell: (d) => <span className="line-clamp-2 max-w-md">{d.reason}</span> },
            { label: "Status", cell: (d) => <Pill tone={TONE[d.status]}>{d.status}</Pill> },
          ]}
        />
      )}
      <Dialog
        open={Boolean(open)}
        onOpenChange={(o) => !o && setOpen(null)}
        title="Dispute"
        description={open ? `Raised ${formatDateTime(open.createdAt)}` : undefined}
        footer={
          manage && open?.status === "pending" ? (
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
                ["Customer", open.user ? `${open.user.firstName ?? ""} ${open.user.lastName ?? ""} · ${open.user.email}` : "—"],
                ["Job", <span key="j" className="pl-mono text-xs">{open.printJobId}</span>],
                ["Resolution", open.resolutionNotes ?? "—"],
              ]}
            />
            {manage && open.status === "pending" ? (
              <Textarea label="What did you do? (the customer sees this)" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            ) : null}
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
