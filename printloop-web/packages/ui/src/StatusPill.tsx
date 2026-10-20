import { cx } from "./cx";

type Tone = "ink" | "persimmon" | "ochre" | "sage" | "fog" | "outline";

const TONE: Record<Tone, string> = {
  ink: "bg-ink text-paper",
  persimmon: "bg-persimmon text-paper",
  ochre: "bg-ochre text-paper",
  sage: "bg-sage text-paper",
  fog: "bg-fog/20 text-ink",
  outline: "text-fog border border-fog",
};

export const JOB_STATUS: Record<string, { label: string; tone: Tone; live?: boolean }> = {
  pending: { label: "Awaiting payment", tone: "ochre" },
  awaiting_payment: { label: "Awaiting payment", tone: "ochre" },
  paid: { label: "Paid", tone: "sage" },
  rendering: { label: "Preparing", tone: "ink", live: true },
  awaiting_accept: { label: "Waiting for shop", tone: "ochre" },
  ready: { label: "Ready", tone: "persimmon" },
  releasing: { label: "Sent to printer", tone: "ink", live: true },
  printing: { label: "Printing", tone: "persimmon", live: true },
  done: { label: "Printed", tone: "outline" },
  failed: { label: "Failed", tone: "persimmon" },
  expired: { label: "Expired", tone: "fog" },
  refunded: { label: "Refunded", tone: "fog" },
  awaiting_edit: { label: "Waiting for edit", tone: "ochre" },
  edit_complete: { label: "Edit ready to review", tone: "persimmon" },
};

export function Pill({
  tone = "ink",
  live,
  children,
  className,
}: {
  tone?: Tone;
  live?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cx("pl-pill whitespace-nowrap", TONE[tone], className)}>
      {live ? <span className="w-1.5 h-1.5 rounded-full bg-current motion-safe:animate-pulse-soft" /> : null}
      {children}
    </span>
  );
}

export function StatusPill({ status, className }: { status: string | null | undefined; className?: string }) {
  const meta = JOB_STATUS[status ?? ""] ?? { label: status ?? "Unknown", tone: "fog" as Tone };
  return (
    <Pill tone={meta.tone} live={meta.live} className={className}>
      {meta.label}
    </Pill>
  );
}
