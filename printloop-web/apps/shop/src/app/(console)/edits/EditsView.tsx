"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable, ErrorState, Pill, Skeleton, Tabs, formatNaira, timeAgo } from "@printloop/ui";
import { errorMessage, type Schemas } from "@printloop/api-client";
import { useApi } from "@printloop/api-client/react";

type Item = Schemas["EditQueueItem"];
type Status = "pending_shop" | "in_progress" | "pending_customer" | "rejected" | "approved";

export const EDIT_STATUS: Record<string, { label: string; tone: "ochre" | "persimmon" | "ink" | "sage" | "fog" }> = {
  pending_shop: { label: "New", tone: "persimmon" },
  in_progress: { label: "Editing", tone: "ink" },
  pending_customer: { label: "With customer", tone: "ochre" },
  rejected: { label: "Changes asked", tone: "persimmon" },
  approved: { label: "Approved", tone: "sage" },
  completed: { label: "Completed", tone: "fog" },
};

export function EditsView() {
  const $api = useApi();
  const router = useRouter();
  const [status, setStatus] = useState<Status>("pending_shop");
  const q = $api.useQuery("get", "/saas/edit-queue", { params: { query: { status, limit: 50 } } }, { refetchInterval: 15_000 });
  const items = (q.data?.data?.items ?? []) as Item[];

  return (
    <div>
      <Tabs
        value={status}
        onChange={setStatus}
        items={[
          { value: "pending_shop", label: "New" },
          { value: "rejected", label: "Changes asked" },
          { value: "in_progress", label: "Editing" },
          { value: "pending_customer", label: "With customer" },
          { value: "approved", label: "Approved" },
        ]}
      />
      {q.error ? (
        <ErrorState message={errorMessage(q.error)} />
      ) : q.isLoading ? (
        <Skeleton className="h-48" />
      ) : (
        <DataTable<Item>
          rows={items}
          rowKey={(i) => i.id}
          onRowClick={(i) => router.push(`/edits/${i.printJobId}`)}
          empty="Nothing here right now."
          mobileTitle={(i) => i.printJob?.fileName ?? "Document"}
          mobileTrailing={(i) => <Pill tone={EDIT_STATUS[i.status]?.tone}>{EDIT_STATUS[i.status]?.label ?? i.status}</Pill>}
          columns={[
            { label: "Document", hideOnMobile: true, cell: (i) => <span className="font-semibold">{i.printJob?.fileName ?? "Document"}</span> },
            { label: "Customer", cell: (i) => i.printJob?.customerName ?? "—" },
            { label: "Request", cell: (i) => <span className="text-xs line-clamp-2 max-w-xs">{i.printJob?.editingInstructions ?? "—"}</span> },
            { label: "Pages", cell: (i) => i.printJob?.pageCount ?? "—" },
            { label: "Fee", align: "right", cell: (i) => <span className="pl-mono">{formatNaira(i.totalEditFee)}</span> },
            { label: "Waiting", cell: (i) => <span className="text-xs text-fog">{timeAgo(i.createdAt)}</span> },
          ]}
        />
      )}
    </div>
  );
}
