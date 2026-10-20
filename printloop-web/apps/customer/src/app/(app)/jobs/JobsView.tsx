"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { EmptyState, ErrorState, Skeleton, Tabs } from "@printloop/ui";
import { errorMessage } from "@printloop/api-client";
import { useJobList } from "@/lib/queries";
import { FINISHED_STATUSES, jobTitle } from "@/lib/jobs";
import { JobRow } from "@/components/JobRow";

type Filter = "active" | "done" | "all";

export function JobsView() {
  const { jobs, isLoading, error } = useJobList();
  const [filter, setFilter] = useState<Filter>("active");
  const [query, setQuery] = useState("");

  const active = useMemo(() => jobs.filter((j) => !FINISHED_STATUSES.has(j.status)), [jobs]);
  const done = useMemo(() => jobs.filter((j) => FINISHED_STATUSES.has(j.status)), [jobs]);
  const visible = useMemo(() => {
    const base = filter === "active" ? active : filter === "done" ? done : jobs;
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter((j) => `${jobTitle(j)} ${j.code ?? ""} ${j.tenantName ?? ""}`.toLowerCase().includes(q));
  }, [filter, active, done, jobs, query]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 justify-between">
        <Tabs
          value={filter}
          onChange={setFilter}
          className="mb-0 sm:mb-0 flex-1"
          items={[
            { value: "active", label: "In progress", count: active.length },
            { value: "done", label: "Finished", count: done.length },
            { value: "all", label: "All", count: jobs.length },
          ]}
        />
        <label className="relative sm:w-64 mb-5">
          <span className="sr-only">Search jobs</span>
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-fog" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="File name or code" className="pl-input pl-9" />
        </label>
      </div>
      {error ? (
        <ErrorState message={errorMessage(error)} />
      ) : isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : visible.length ? (
        <ul className="space-y-3">
          {visible.map((job) => (
            <JobRow key={job.id} job={job} />
          ))}
        </ul>
      ) : (
        <EmptyState
          title={query ? "No jobs match" : filter === "active" ? "Nothing in progress" : "No jobs yet"}
          description={query ? "Try a different file name or code." : "Jobs you upload show up here with their codes and status."}
        />
      )}
    </div>
  );
}
