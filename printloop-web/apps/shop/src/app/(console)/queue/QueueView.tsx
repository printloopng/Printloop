"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  Button,
  DataTable,
  Dialog,
  ErrorState,
  KeyValue,
  Skeleton,
  StatusPill,
  Tabs,
  formatDateTime,
  formatNaira,
  timeAgo,
} from "@printloop/ui";
import { errorMessage, unwrap, type Schemas } from "@printloop/api-client";
import { useApi, useApiClient } from "@printloop/api-client/react";
import { useAction } from "@/lib/actions";

type Job = Schemas["ShopJob"];
type Lane = "action" | "printing" | "unpaid" | "finished";

const LANES: Record<Lane, string[]> = {
  action: ["awaiting_accept", "ready", "failed"],
  printing: ["releasing", "printing", "rendering", "paid"],
  unpaid: ["pending", "awaiting_payment", "awaiting_edit", "edit_complete"],
  finished: ["done", "expired", "refunded"],
};

function summary(job: Job) {
  const c = job.printConfiguration ?? {};
  return [
    c.pages === "range" && c.pageRange ? `pp. ${c.pageRange}` : `${job.totalPages ?? "?"} pg`,
    c.copies && c.copies > 1 ? `×${c.copies}` : null,
    c.paper ?? "A4",
    c.color === "color" ? "Colour" : "B&W",
    c.sided === "double" ? "Duplex" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function JobActions({ job, onDone }: { job: Job; onDone?: () => void }) {
  const client = useApiClient();
  const { run, isPending } = useAction();
  const invalidate = ["/saas/jobs", "/saas/ops/summary"];
  const id = { params: { path: { id: job.id } } };
  if (job.status === "awaiting_accept")
    return (
      <Button size="sm" loading={isPending("accept")} onClick={() => run("accept", () => unwrap(client.POST("/saas/jobs/{id}/accept", id)), { success: "Accepted.", invalidate }).then(onDone)}>
        Accept
      </Button>
    );
  if (job.status === "ready")
    return (
      <Button size="sm" variant="dark" loading={isPending("release")} onClick={() => run("release", () => unwrap(client.POST("/saas/jobs/{id}/release", id)), { success: "Sent to the printer.", invalidate }).then(onDone)}>
        Print now
      </Button>
    );
  if (job.status === "printing" || job.status === "releasing")
    return (
      <Button
        size="sm"
        variant="ghost"
        loading={isPending("done")}
        onClick={() => run("done", () => unwrap(client.PATCH("/saas/jobs/{id}/status", { ...id, body: { status: "done" } })), { success: "Marked collected.", invalidate }).then(onDone)}
      >
        Mark collected
      </Button>
    );
  if (job.status === "failed")
    return (
      <Button size="sm" variant="ghost" loading={isPending("requeue")} onClick={() => run("requeue", () => unwrap(client.PATCH("/saas/jobs/{id}/requeue", id)), { success: "Back in the queue.", invalidate }).then(onDone)}>
        Retry
      </Button>
    );
  return null;
}

export function QueueView() {
  const $api = useApi();
  const [lane, setLane] = useState<Lane>("action");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Job | null>(null);
  const q = $api.useQuery("get", "/saas/jobs", { params: { query: { limit: 100, search: search.trim() || undefined } } }, { refetchInterval: 5_000 });
  const jobs = useMemo(() => (q.data?.data?.jobs ?? []) as Job[], [q.data]);
  const counts = useMemo(
    () => Object.fromEntries((Object.keys(LANES) as Lane[]).map((l) => [l, jobs.filter((j) => LANES[l].includes(j.status)).length])) as Record<Lane, number>,
    [jobs],
  );
  const rows = jobs.filter((j) => LANES[lane].includes(j.status));

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-end gap-3 justify-between">
        <Tabs
          value={lane}
          onChange={setLane}
          className="flex-1"
          items={[
            { value: "action", label: "Needs action", count: counts.action },
            { value: "printing", label: "Printing", count: counts.printing },
            { value: "unpaid", label: "Unpaid / editing", count: counts.unpaid },
            { value: "finished", label: "Finished", count: counts.finished },
          ]}
        />
        <label className="relative md:w-64 mb-5">
          <span className="sr-only">Search jobs</span>
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-fog" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Code or file name" className="pl-input pl-9" />
        </label>
      </div>
      {q.error ? (
        <ErrorState message={errorMessage(q.error)} />
      ) : q.isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <DataTable<Job>
          rows={rows}
          rowKey={(j) => j.id}
          onRowClick={setOpen}
          caption="Jobs"
          empty={lane === "action" ? "Nothing waiting. New paid jobs appear here automatically." : "No jobs here."}
          mobileTitle={(j) => j.fileName ?? "Document"}
          mobileTrailing={(j) => <StatusPill status={j.status} />}
          columns={[
            { label: "Code", cell: (j) => <span className="pl-mono font-bold">{j.code ?? "—"}</span> },
            { label: "Document", hideOnMobile: true, cell: (j) => <span className="font-semibold truncate block max-w-[16rem]">{j.fileName ?? "Document"}</span> },
            { label: "Customer", cell: (j) => (j.user ? `${j.user.firstName} ${j.user.lastName}` : "Guest") },
            { label: "Job", cell: (j) => <span className="text-xs">{summary(j)}</span> },
            { label: "Status", hideOnMobile: true, cell: (j) => <StatusPill status={j.status} /> },
            { label: "Paid", align: "right", cell: (j) => <span className="pl-mono">{formatNaira(j.finalCost ?? j.cost)}</span> },
            { label: "Age", cell: (j) => <span className="text-xs text-fog">{timeAgo(j.createdAt)}</span> },
            { label: "", align: "right", cell: (j) => <span onClick={(e) => e.stopPropagation()}><JobActions job={j} /></span> },
          ]}
        />
      )}

      <Dialog open={Boolean(open)} onOpenChange={(o) => !o && setOpen(null)} title={open?.fileName ?? "Job"} description={open ? `Code ${open.code ?? "—"}` : undefined} footer={open ? <JobActions job={open} onDone={() => setOpen(null)} /> : null}>
        {open ? (
          <KeyValue
            items={[
              ["Status", <StatusPill key="s" status={open.status} />],
              ["Customer", open.user ? `${open.user.firstName} ${open.user.lastName}` : "Guest"],
              ["Job", summary(open)],
              ["Printed", `${open.pagesCompleted ?? 0} of ${open.totalPages ?? 0} pages`],
              ["Paid", formatNaira(open.finalCost ?? open.cost)],
              ["Reference", open.paymentReference ?? "—"],
              ["Created", formatDateTime(open.createdAt)],
              ["Completed", formatDateTime(open.completedAt)],
            ]}
          />
        ) : null}
      </Dialog>
    </div>
  );
}
