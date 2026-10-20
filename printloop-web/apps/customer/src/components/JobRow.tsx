"use client";

import Link from "next/link";
import { StatusPill, formatNaira, timeAgo } from "@printloop/ui";
import { configSummary, jobAmount, jobProgress, jobTitle, LIVE_STATUSES, type Job } from "@/lib/jobs";
import { JobActions } from "./JobActions";

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  return (
    <div className="w-full" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-label={label}>
      <div className="h-2 bg-ink/10 overflow-hidden">
        <div className="h-full bg-persimmon transition-all duration-expressive" style={{ width: `${Math.max(4, value * 100)}%` }} />
      </div>
    </div>
  );
}

export function JobRow({ job }: { job: Job }) {
  const live = LIVE_STATUSES.has(job.status);
  return (
    <li className="border-2 border-ink bg-paper-light p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <Link href={`/jobs/${job.id}`} className="flex-1 min-w-0 group">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold truncate group-hover:text-persimmon">{jobTitle(job)}</span>
          <StatusPill status={job.status} />
        </div>
        <div className="mt-1 text-xs text-fog flex flex-wrap gap-x-3">
          <span>{configSummary(job)}</span>
          {job.tenantName ? <span>{job.tenantName}</span> : null}
          <span>{timeAgo(job.createdAt)}</span>
          {job.code ? <span className="pl-mono font-bold text-ink">{job.code}</span> : null}
        </div>
        {live && job.status === "printing" ? (
          <div className="mt-2 max-w-sm">
            <ProgressBar value={jobProgress(job)} label="Printing progress" />
            <div className="text-[11px] text-fog mt-1">
              {job.pagesCompleted ?? 0} of {job.pageCount} pages
            </div>
          </div>
        ) : null}
      </Link>
      <div className="flex items-center gap-3 sm:justify-end">
        <span className="pl-mono font-bold tabular-nums">{formatNaira(jobAmount(job))}</span>
        <JobActions job={job} />
      </div>
    </li>
  );
}
