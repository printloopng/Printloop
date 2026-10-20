"use client";

import { cx } from "./cx";

export function Tabs<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  items: Array<{ value: T; label: string; count?: number }>;
  className?: string;
}) {
  return (
    <div role="tablist" className={cx("flex gap-1 overflow-x-auto border-b-2 border-ink mb-5", className)}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cx(
              "px-3 py-2 text-[11px] font-bold tracking-editorial uppercase whitespace-nowrap border-2 border-b-0 -mb-[2px] transition-colors",
              active ? "bg-ink text-paper border-ink" : "border-transparent text-ink/55 hover:text-ink",
            )}
          >
            {item.label}
            {item.count !== undefined ? (
              <span className={cx("ml-1.5 pl-mono", active ? "text-persimmon" : "text-ink/40")}>{item.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  items,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  items: Array<{ value: T; label: string }>;
  label?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex border-2 border-ink rounded-md overflow-hidden">
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            role="radio"
            type="button"
            aria-checked={active}
            onClick={() => onChange(item.value)}
            className={cx(
              "px-3 py-1.5 text-[11px] font-bold tracking-editorial uppercase transition-colors",
              active ? "bg-ink text-paper" : "bg-paper-light text-ink/60 hover:text-ink",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
