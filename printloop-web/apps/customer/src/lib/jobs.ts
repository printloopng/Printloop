import type { Schemas } from "@printloop/api-client";

export type Job = Schemas["CustomerJob"];

export const LIVE_STATUSES = new Set(["rendering", "releasing", "printing", "awaiting_accept"]);
export const PAYABLE_STATUSES = new Set(["pending", "awaiting_payment"]);
export const RELEASABLE_STATUSES = new Set(["ready"]);
export const FINISHED_STATUSES = new Set(["done", "failed", "expired", "refunded"]);

export function jobTitle(job: Job): string {
  return job.title || job.fileName || "Untitled document";
}

export function jobAmount(job: Job): number {
  return Number(job.finalCost ?? job.cost ?? 0);
}

export function jobProgress(job: Job): number {
  const total = Number(job.pageCount || 0);
  if (!total) return job.status === "done" ? 1 : 0;
  return Math.min(1, Number(job.pagesCompleted || 0) / total);
}

export function configSummary(job: Job): string {
  const c = job.printConfiguration ?? {};
  const parts = [
    c.pages === "range" && c.pageRange ? `pp. ${c.pageRange} of ${job.pageCount ?? "?"}` : `${job.pageCount ?? "?"} pg`,
    c.copies && c.copies > 1 ? `×${c.copies}` : null,
    c.paper ?? "A4",
    c.color === "color" ? "Colour" : "B&W",
    c.sided === "double" ? "Duplex" : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

export function nextAction(job: Job): "pay" | "release" | "review-edit" | "wait-edit" | "track" | null {
  if (job.status === "edit_complete") return "review-edit";
  if (job.status === "awaiting_edit") return "wait-edit";
  if (PAYABLE_STATUSES.has(job.status)) return "pay";
  if (RELEASABLE_STATUSES.has(job.status)) return "release";
  if (LIVE_STATUSES.has(job.status)) return "track";
  return null;
}
