import type { ReactNode } from "react";
import { cx } from "./cx";

export function Wordmark({ suffix, className }: { suffix?: string; className?: string }) {
  return (
    <span className={cx("font-serif font-extrabold text-[22px] tracking-tight leading-none", className)}>
      PrintLoop<span className="text-persimmon">.</span>
      {suffix ? (
        <span className="ml-2 text-[10px] font-bold tracking-editorial align-middle text-ink/50 font-sans">
          {suffix}
        </span>
      ) : null}
    </span>
  );
}

export function PageHeader({
  kicker,
  title,
  description,
  actions,
  className,
}: {
  kicker?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cx(
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b-2 border-ink pb-5 mb-6",
        className,
      )}
    >
      <div className="min-w-0">
        {kicker ? <div className="editorial-label text-persimmon mb-2">{kicker}</div> : null}
        <h1 className="font-serif text-3xl sm:text-4xl font-extrabold tracking-tight leading-[1.05]">{title}</h1>
        {description ? <p className="mt-2 text-ink/65 font-serif italic max-w-2xl">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2 shrink-0">{actions}</div> : null}
    </header>
  );
}

export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("mb-8", className)}>
      {title || actions ? (
        <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
          <div>
            {title ? <h2 className="font-serif text-xl font-bold tracking-tight">{title}</h2> : null}
            {description ? <p className="text-sm text-ink/60 mt-0.5">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Card({ children, className, interactive }: { children: ReactNode; className?: string; interactive?: boolean }) {
  return (
    <div
      className={cx(
        "border-2 border-ink rounded-lg bg-paper-light p-5",
        interactive && "transition-all duration-150 hover:-translate-x-[3px] hover:-translate-y-[3px] hover:shadow-brutal",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "accent" | "dark";
}) {
  const toneClass =
    tone === "accent" ? "bg-persimmon text-paper" : tone === "dark" ? "bg-ink text-paper" : "bg-paper-light";
  return (
    <div className={cx("border-2 border-ink rounded-lg p-4", toneClass)}>
      <div className={cx("editorial-label", tone === "default" ? "text-ink/60" : "text-paper/75")}>{label}</div>
      <div className="mt-2 font-serif text-3xl font-extrabold tracking-tight tabular-nums">{value}</div>
      {hint ? (
        <div className={cx("mt-1 text-xs", tone === "default" ? "text-fog" : "text-paper/70")}>{hint}</div>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="border-2 border-dashed border-ink/30 rounded-lg p-8 sm:p-10 text-center">
      {icon ? <div className="mx-auto mb-3 w-fit text-ochre">{icon}</div> : null}
      <div className="font-serif text-xl font-bold">{title}</div>
      {description ? <p className="mt-1 text-sm text-ink/60 max-w-md mx-auto">{description}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", message, action }: { title?: string; message?: ReactNode; action?: ReactNode }) {
  return (
    <div role="alert" className="border-2 border-persimmon rounded-lg p-6 bg-persimmon/5">
      <div className="editorial-label text-persimmon">Error</div>
      <div className="font-serif text-xl font-bold mt-1">{title}</div>
      {message ? <p className="text-sm text-ink/70 mt-1">{message}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Spinner({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cx("inline-block border-[3px] border-persimmon border-t-transparent rounded-full animate-spin", className)}
      style={{ width: size, height: size }}
    />
  );
}

export function InlineLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="flex flex-col items-center gap-3">
        <Spinner size={32} />
        <p className="pl-serif italic text-ink/50 text-sm">{label}</p>
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("pl-skeleton", className)} aria-hidden="true" />;
}

export function Notice({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: "info" | "warn" | "success" | "danger";
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const cls = {
    info: "border-ink bg-paper-warm",
    warn: "border-ochre bg-ochre/10",
    success: "border-sage bg-sage/10",
    danger: "border-persimmon bg-persimmon/10",
  }[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cx("border-2 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center gap-3", cls)}
    >
      <div className="flex-1 min-w-0">
        {title ? <div className="font-bold text-sm">{title}</div> : null}
        {children ? <div className="text-sm text-ink/75 mt-0.5">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function KeyValue({ items, className }: { items: Array<[ReactNode, ReactNode]>; className?: string }) {
  return (
    <dl className={cx("grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm", className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="editorial-label text-fog self-center">{k}</dt>
          <dd className="text-ink break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
