export const JOB_STATUSES = [
  "pending",
  "rendering",
  "awaiting_accept",
  "ready",
  "releasing",
  "printing",
  "done",
  "failed",
  "expired",
  "refunded",
  "awaiting_edit",
  "edit_complete",
  "awaiting_payment",
  "paid",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const ACTIVE_JOB_STATUSES: ReadonlySet<string> = new Set(["rendering", "releasing", "printing"]);
