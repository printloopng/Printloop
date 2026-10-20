"use client";

import Link from "next/link";
import { FileText, Layers, MapPin, Plus, Printer, Users } from "lucide-react";
import { EmptyState, ErrorState, Notice, Skeleton, StatCard, buttonClass, formatNaira } from "@printloop/ui";
import { errorMessage } from "@printloop/api-client";
import { useShop } from "@/lib/shop-context";
import { useJobList } from "@/lib/queries";
import { FINISHED_STATUSES, jobAmount, nextAction } from "@/lib/jobs";
import { CodeCard } from "@/components/CodeCard";
import { JobRow } from "@/components/JobRow";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const ACTIONS = [
  { href: "/print/new", label: "New print", hint: "One document", icon: Plus, tone: "bg-persimmon text-paper" },
  { href: "/print/batch", label: "Batch", hint: "Several files, one code", icon: Layers, tone: "bg-ink text-paper" },
  { href: "/groups", label: "Group print", hint: "Collect from classmates", icon: Users, tone: "bg-paper-light" },
  { href: "/stations", label: "Stations", hint: "Printers near you", icon: Printer, tone: "bg-paper-light" },
];

export function HomeView({ firstName }: { firstName: string }) {
  const shop = useShop();
  const { jobs, isLoading, error } = useJobList();
  const ready = jobs.filter((j) => j.status === "ready" && j.code);
  const attention = jobs.filter((j) => {
    const a = nextAction(j);
    return a === "pay" || a === "review-edit" || a === "track" || a === "wait-edit";
  });
  const recent = jobs.slice(0, 6);
  const spent = jobs.filter((j) => !["pending", "awaiting_payment", "refunded"].includes(j.status)).reduce((s, j) => s + jobAmount(j), 0);
  const pages = jobs.filter((j) => j.status === "done").reduce((s, j) => s + Number(j.pageCount || 0), 0);

  return (
    <div className="space-y-10">
      <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div>
          <div className="editorial-label text-persimmon">{new Date().toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long" })}</div>
          <h1 className="mt-2 font-serif text-4xl sm:text-5xl font-extrabold tracking-tight leading-[1.02]">
            {greeting()}
            {firstName ? `, ${firstName}` : ""}.
          </h1>
          <p className="mt-2 font-serif italic text-ink/60 text-lg">
            {shop ? (
              <>Printing at <span className="not-italic font-bold text-ink">{shop.name}</span>.</>
            ) : (
              "Pick a shop to start printing."
            )}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 w-full lg:w-auto lg:min-w-[22rem]">
          <StatCard label="Pages printed" value={pages.toLocaleString("en-NG")} />
          <StatCard label="Spent" value={formatNaira(spent)} tone="dark" />
        </div>
      </section>

      {!shop ? (
        <Notice
          tone="warn"
          title="You haven't picked a print shop"
          action={
            <Link href="/shops" className={buttonClass("primary", "sm")}>
              <MapPin size={14} /> Find a shop
            </Link>
          }
        >
          Prices and printers depend on the shop. Choose one near you to upload.
        </Notice>
      ) : null}

      <section aria-labelledby="actions" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <h2 id="actions" className="sr-only">Quick actions</h2>
        {ACTIONS.map((a) => {
          const Icon = a.icon;
          return (
            <Link key={a.href} href={a.href} className={`pl-card ${a.tone} flex flex-col gap-3 min-h-[8.5rem]`}>
              <Icon size={24} />
              <span className="mt-auto">
                <span className="block font-serif text-xl font-bold leading-tight">{a.label}</span>
                <span className="block text-xs opacity-70 mt-0.5">{a.hint}</span>
              </span>
            </Link>
          );
        })}
      </section>

      {error ? <ErrorState message={errorMessage(error)} /> : null}

      {ready.length ? (
        <section aria-labelledby="ready">
          <div className="flex items-end justify-between mb-3">
            <h2 id="ready" className="font-serif text-2xl font-bold">Ready to collect</h2>
            <span className="editorial-label text-ink/50">{ready.length} code{ready.length === 1 ? "" : "s"}</span>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ready.slice(0, 3).map((job) => (
              <CodeCard key={job.id} job={job} compact />
            ))}
          </div>
        </section>
      ) : null}

      {attention.length ? (
        <section aria-labelledby="attention">
          <h2 id="attention" className="font-serif text-2xl font-bold mb-3">Needs your attention</h2>
          <ul className="space-y-3">
            {attention.map((job) => (
              <JobRow key={job.id} job={job} />
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="recent">
        <div className="flex items-end justify-between mb-3">
          <h2 id="recent" className="font-serif text-2xl font-bold">Recent prints</h2>
          <Link href="/jobs" className="pl-link text-sm font-semibold">
            All jobs
          </Link>
        </div>
        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : recent.length ? (
          <ul className="space-y-3">
            {recent.filter((j) => FINISHED_STATUSES.has(j.status) || !attention.includes(j)).map((job) => (
              <JobRow key={job.id} job={job} />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<FileText size={32} />}
            title="Nothing printed yet"
            description="Upload a PDF, Word file or photo and pick it up at any station in your shop."
            action={
              <Link href="/print/new" className={buttonClass("primary")}>
                Start a print <span className="pl-arrow">→</span>
              </Link>
            }
          />
        )}
      </section>
    </div>
  );
}
