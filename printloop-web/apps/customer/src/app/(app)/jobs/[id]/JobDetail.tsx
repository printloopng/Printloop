"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Circle, Loader2 } from "lucide-react";
import {
  Button,
  Card,
  EmptyState,
  InlineLoader,
  KeyValue,
  Notice,
  StatusPill,
  cx,
  formatDateTime,
  formatNaira,
} from "@printloop/ui";
import { configSummary, jobAmount, jobProgress, jobTitle, LIVE_STATUSES, type Job } from "@/lib/jobs";
import { useJobList } from "@/lib/queries";
import { CodeCard } from "@/components/CodeCard";
import { JobActions } from "@/components/JobActions";
import { ProgressBar } from "@/components/JobRow";
import { DisputeDialog } from "./DisputeDialog";
import { ReviewDialog } from "./ReviewDialog";

const TIMELINE = [
  { key: "uploaded", label: "Uploaded" },
  { key: "paid", label: "Paid" },
  { key: "ready", label: "Ready to print" },
  { key: "printing", label: "Printing" },
  { key: "done", label: "Collected" },
] as const;

function stageOf(job: Job): number {
  switch (job.status) {
    case "pending":
    case "awaiting_payment":
    case "awaiting_edit":
    case "edit_complete":
      return 0;
    case "paid":
    case "rendering":
    case "awaiting_accept":
      return 1;
    case "ready":
      return 2;
    case "releasing":
    case "printing":
      return 3;
    case "done":
      return 4;
    default:
      return -1;
  }
}

function Timeline({ job }: { job: Job }) {
  const stage = stageOf(job);
  if (stage < 0) return null;
  return (
    <ol className="grid grid-cols-5 gap-1" aria-label="Job progress">
      {TIMELINE.map((step, i) => {
        const done = i < stage || (i === stage && job.status === "done");
        const current = i === stage && job.status !== "done";
        return (
          <li key={step.key} className="flex flex-col items-center text-center gap-1.5">
            <span
              className={cx(
                "h-8 w-8 grid place-items-center border-2",
                done ? "bg-ink border-ink text-paper" : current ? "bg-persimmon border-ink text-paper" : "border-ink/25 text-ink/30",
              )}
            >
              {done ? <Check size={16} /> : current && LIVE_STATUSES.has(job.status) ? <Loader2 size={16} className="motion-safe:animate-spin" /> : <Circle size={10} />}
            </span>
            <span className={cx("text-[10px] font-bold tracking-editorial uppercase leading-tight", done || current ? "text-ink" : "text-ink/40")}>
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function JobDetail({ id, justPaid }: { id: string; justPaid: boolean }) {
  const { jobs, isLoading } = useJobList();
  const job = jobs.find((j) => j.id === id);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [waited, setWaited] = useState(0);
  const awaitingWebhook = justPaid && job && (job.status === "pending" || job.status === "awaiting_payment");

  useEffect(() => {
    if (!awaitingWebhook) return;
    const t = setInterval(() => setWaited((w) => w + 1), 1000);
    return () => clearInterval(t);
  }, [awaitingWebhook]);

  if (isLoading) return <InlineLoader />;
  if (!job) {
    return (
      <EmptyState
        title="Job not found"
        description="It may belong to another account, or it was removed."
        action={
          <Link href="/jobs" className="pl-btn-primary">
            My jobs
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/jobs" className="inline-flex items-center gap-1.5 editorial-label text-ink/50 hover:text-persimmon">
        <ArrowLeft size={13} /> My jobs
      </Link>
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b-2 border-ink pb-5">
        <div className="min-w-0">
          <StatusPill status={job.status} />
          <h1 className="mt-3 font-serif text-3xl sm:text-4xl font-extrabold tracking-tight break-words">{jobTitle(job)}</h1>
          <p className="mt-1 text-sm text-fog">
            {configSummary(job)}
            {job.tenantName ? ` · ${job.tenantName}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="pl-mono text-2xl font-bold">{formatNaira(jobAmount(job))}</span>
          <JobActions job={job} size="md" />
        </div>
      </header>

      {awaitingWebhook ? (
        <Notice tone="info" title="Confirming your payment">
          {waited < 30
            ? "Paystack is telling us about your payment. Your code appears here in a few seconds."
            : "This is taking longer than usual. If you were charged, your code will appear shortly. Contact the shop if it doesn't within 10 minutes."}
        </Notice>
      ) : null}
      {justPaid && job.code && !awaitingWebhook ? <Notice tone="success" title="Payment confirmed">Your print code is ready.</Notice> : null}
      {job.status === "awaiting_edit" ? (
        <Notice tone="info" title="The shop is editing your document">You&apos;ll review the changes before paying.</Notice>
      ) : null}
      {job.status === "failed" ? (
        <Notice tone="danger" title="This print failed">
          The printer reported a problem. Report it and the shop will reprint or refund you.
        </Notice>
      ) : null}

      <Card>
        <Timeline job={job} />
        {job.status === "printing" || job.status === "releasing" ? (
          <div className="mt-6">
            <ProgressBar value={jobProgress(job)} label="Printing progress" />
            <p className="text-sm text-fog mt-2">
              {job.status === "releasing" ? "Waiting for the printer to pick it up…" : `${job.pagesCompleted ?? 0} of ${job.pageCount} pages printed`}
            </p>
          </div>
        ) : null}
      </Card>

      <div className="grid lg:grid-cols-[1fr_1.1fr] gap-6 items-start">
        {job.code && ["ready", "releasing", "printing", "paid", "rendering", "awaiting_accept"].includes(job.status) ? (
          <CodeCard job={job} />
        ) : null}
        <Card>
          <h2 className="font-serif text-xl font-bold mb-4">Details</h2>
          <KeyValue
            items={[
              ["Reference", <span key="r" className="pl-mono text-xs break-all">{job.id}</span>],
              ["Created", formatDateTime(job.createdAt)],
              ["Expires", formatDateTime(job.expiresAt)],
              ["Completed", formatDateTime(job.completedAt)],
              ["Pages", String(job.pageCount ?? "—")],
              ["Paid", formatNaira(jobAmount(job))],
              ...(job.shortfall ? ([["Balance due", formatNaira(job.shortfall)]] as [string, string][]) : []),
            ]}
          />
          <div className="mt-6 flex flex-wrap gap-2 border-t-2 border-ink/10 pt-4">
            {["done", "failed", "printing", "ready"].includes(job.status) ? (
              <Button variant="ghost" size="sm" onClick={() => setDisputeOpen(true)}>
                Report a problem
              </Button>
            ) : null}
            {job.status === "done" && job.tenantSlug ? (
              <Button variant="dark" size="sm" onClick={() => setReviewOpen(true)}>
                Review {job.tenantName ?? "the shop"}
              </Button>
            ) : null}
          </div>
        </Card>
      </div>

      <DisputeDialog jobId={job.id} open={disputeOpen} onOpenChange={setDisputeOpen} />
      {job.tenantSlug ? (
        <ReviewDialog slug={job.tenantSlug} shopName={job.tenantName ?? "the shop"} open={reviewOpen} onOpenChange={setReviewOpen} />
      ) : null}
    </div>
  );
}
