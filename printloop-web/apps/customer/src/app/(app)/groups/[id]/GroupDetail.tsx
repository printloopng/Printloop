"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Share2 } from "lucide-react";
import {
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  EmptyState,
  InlineLoader,
  Pill,
  QrBlock,
  StatCard,
  formatDateTime,
  formatNaira,
  timeAgo,
  toast,
} from "@printloop/ui";
import { errorMessage, unwrap, type Schemas } from "@printloop/api-client";
import { useApi, useApiClient, useQueryClient } from "@printloop/api-client/react";

type Participant = Schemas["GroupParticipant"];

const STATUS: Record<string, { label: string; tone: "fog" | "ochre" | "sage" | "persimmon" }> = {
  INVITED: { label: "Invited", tone: "fog" },
  JOINED: { label: "Joined", tone: "fog" },
  UPLOADED: { label: "Unpaid", tone: "ochre" },
  PAID: { label: "Paid", tone: "sage" },
  CANCELLED: { label: "Cancelled", tone: "persimmon" },
};

export function GroupDetail({ id }: { id: string }) {
  const $api = useApi();
  const client = useApiClient();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const q = $api.useQuery("get", "/groups/{id}", { params: { path: { id } } }, { refetchInterval: 10_000 });
  const data = q.data?.data;

  if (q.isLoading) return <InlineLoader />;
  if (!data) {
    return (
      <EmptyState
        title="Group not found"
        description={q.error ? errorMessage(q.error) : "Only the person who created a group can manage it."}
        action={<Link href="/groups" className="pl-btn-primary">My groups</Link>}
      />
    );
  }

  const { session, participants, summary } = data;
  const shareUrl = typeof window === "undefined" ? "" : `${window.location.origin}/join/${session.shareId}`;
  const open = session.status === "open";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied.");
    } catch {
      toast.error("Copy failed. Long-press the link to copy it.");
    }
  };
  const share = async () => {
    if (navigator.share) {
      await navigator.share({ title: session.groupName, text: `Upload your document for ${session.groupName}`, url: shareUrl }).catch(() => undefined);
    } else {
      await copy();
    }
  };
  const close = async () => {
    try {
      await unwrap(client.POST("/groups/{id}/close", { params: { path: { id } } }));
      await qc.invalidateQueries({ queryKey: ["get", "/groups/{id}"] });
      toast.success("Group closed. Your batch code is ready.");
    } catch (err) {
      toast.error(errorMessage(err));
      throw err;
    }
  };

  return (
    <div className="space-y-6">
      <Link href="/groups" className="inline-flex items-center gap-1.5 editorial-label text-ink/50 hover:text-persimmon">
        <ArrowLeft size={13} /> Groups
      </Link>
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b-2 border-ink pb-5">
        <div>
          <Pill tone={open ? "sage" : "ink"} live={open}>
            {open ? "Collecting uploads" : "Closed"}
          </Pill>
          <h1 className="mt-3 font-serif text-3xl sm:text-4xl font-extrabold tracking-tight">{session.groupName}</h1>
          <p className="mt-1 text-sm text-fog">{open ? `Uploads close ${formatDateTime(session.deadline)}` : `Closed ${timeAgo(session.closedAt)}`}</p>
        </div>
        {open ? (
          <Button variant="dark" onClick={() => setConfirm(true)} disabled={!summary.paid}>
            Close &amp; get batch code
          </Button>
        ) : null}
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Joined" value={summary.totalParticipants} />
        <StatCard label="Uploaded" value={summary.uploaded} />
        <StatCard label="Paid" value={summary.paid} tone="accent" />
        <StatCard label="Collected" value={formatNaira(summary.totalAmountPaid)} tone="dark" />
      </div>

      <div className="grid lg:grid-cols-[1fr_1.4fr] gap-6 items-start">
        {open ? (
          <Card>
            <h2 className="font-serif text-xl font-bold">Invite your group</h2>
            <p className="text-sm text-ink/60 mt-1">Anyone with this link can join and upload until the deadline.</p>
            <div className="mt-4 flex items-center gap-2 border-2 border-ink bg-paper p-2">
              <span className="pl-mono text-xs truncate flex-1">{shareUrl}</span>
              <button type="button" className="pl-btn-ghost pl-btn-sm" onClick={copy} aria-label="Copy link">
                <Copy size={13} />
              </button>
              <button type="button" className="pl-btn-primary pl-btn-sm" onClick={share}>
                <Share2 size={13} /> Share
              </button>
            </div>
            <div className="mt-5 flex justify-center">
              <QrBlock value={shareUrl} label="Scan to join" size={150} fileName={`group-${session.shareId}`} />
            </div>
          </Card>
        ) : session.batchCode ? (
          <div className="border-2 border-ink bg-ink text-paper p-6 text-center">
            <div className="editorial-label text-persimmon">Batch code</div>
            <div className="mt-2 pl-mono text-5xl font-bold tracking-[0.15em]">{session.batchCode}</div>
            <p className="mt-2 text-sm text-paper/70">Enter it at any station in this shop to print every paid document.</p>
            <div className="mt-5 bg-paper p-4 inline-block">
              <QrBlock value={`printloop://batch/${session.batchCode}`} size={140} fileName={`batch-${session.batchCode}`} />
            </div>
          </div>
        ) : null}

        <section aria-labelledby="members">
          <h2 id="members" className="font-serif text-xl font-bold mb-3">
            Members
          </h2>
          <DataTable<Participant>
            rows={participants}
            rowKey={(p) => p.id}
            empty="No one has joined yet. Share the link."
            mobileTitle={(p) => p.name}
            mobileTrailing={(p) => <Pill tone={STATUS[p.status]?.tone ?? "fog"}>{STATUS[p.status]?.label ?? p.status}</Pill>}
            columns={[
              { label: "Name", cell: (p) => <span className="font-semibold">{p.name}</span>, hideOnMobile: true },
              { label: "Contact", cell: (p) => <span className="text-xs text-fog">{p.email || p.phoneNumber || "—"}</span> },
              { label: "Joined", cell: (p) => timeAgo(p.joinedAt) },
              {
                label: "Status",
                hideOnMobile: true,
                cell: (p) => <Pill tone={STATUS[p.status]?.tone ?? "fog"}>{STATUS[p.status]?.label ?? p.status}</Pill>,
              },
            ]}
          />
          {summary.uploaded > summary.paid ? (
            <p className="text-xs text-fog mt-3">Only paid documents print. Remind unpaid members before you close the group.</p>
          ) : null}
        </section>
      </div>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Close this group?"
        description={`No more uploads after this. ${summary.paid} paid document${summary.paid === 1 ? "" : "s"} will be in the batch.`}
        confirmLabel="Close group"
        onConfirm={close}
      />
    </div>
  );
}
