"use client";

import { Minus, Plus } from "lucide-react";
import { cx } from "@printloop/ui";

export type Quality = 100 | 300 | 600;

export interface PrintConfig {
  copies: number;
  paper: string;
  color: "bw" | "color";
  sided: "single" | "double";
  qualityDpi: Quality;
  orientation: "portrait" | "landscape";
  pages: "all" | "range";
  pageRange: string;
}

export const DEFAULT_CONFIG: PrintConfig = {
  copies: 1,
  paper: "A4",
  color: "bw",
  sided: "single",
  qualityDpi: 300,
  orientation: "portrait",
  pages: "all",
  pageRange: "",
};

const QUALITIES: { value: Quality; label: string; hint: string }[] = [
  { value: 100, label: "Draft", hint: "100 dpi" },
  { value: 300, label: "Standard", hint: "300 dpi" },
  { value: 600, label: "Sharp", hint: "600 dpi" },
];

function Chips<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset>
      <legend className="editorial-label mb-2">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            disabled={o.disabled}
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={cx("pl-chip", value === o.value && "pl-chip-active", o.disabled && "opacity-40 cursor-not-allowed")}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function PrintOptions({
  config,
  onChange,
  papers,
  colourAvailable,
  rangeable,
  totalPages,
  rangeError,
}: {
  config: PrintConfig;
  onChange: (next: PrintConfig) => void;
  papers: string[];
  colourAvailable: boolean;
  rangeable: boolean;
  totalPages: number;
  rangeError?: string | null;
}) {
  const set = <K extends keyof PrintConfig>(key: K, value: PrintConfig[K]) => onChange({ ...config, [key]: value });
  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-2 gap-6">
        <fieldset>
          <legend className="editorial-label mb-2">Copies</legend>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Fewer copies" className="pl-btn-ghost pl-btn-sm" onClick={() => set("copies", Math.max(1, config.copies - 1))}>
              <Minus size={14} />
            </button>
            <output className="pl-mono text-2xl font-bold w-12 text-center" aria-live="polite">
              {config.copies}
            </output>
            <button type="button" aria-label="More copies" className="pl-btn-ghost pl-btn-sm" onClick={() => set("copies", Math.min(99, config.copies + 1))}>
              <Plus size={14} />
            </button>
          </div>
        </fieldset>
        <Chips label="Paper" value={config.paper} options={papers.map((p) => ({ value: p, label: p }))} onChange={(v) => set("paper", v)} />
        <Chips
          label="Colour"
          value={config.color}
          options={[
            { value: "bw", label: "Black & white" },
            { value: "color", label: "Colour", disabled: !colourAvailable },
          ]}
          onChange={(v) => set("color", v)}
        />
        <Chips
          label="Sides"
          value={config.sided}
          options={[
            { value: "single", label: "Single-sided" },
            { value: "double", label: "Double-sided" },
          ]}
          onChange={(v) => set("sided", v)}
        />
        <Chips
          label="Orientation"
          value={config.orientation}
          options={[
            { value: "portrait", label: "Portrait" },
            { value: "landscape", label: "Landscape" },
          ]}
          onChange={(v) => set("orientation", v)}
        />
        <Chips
          label="Pages"
          value={config.pages}
          options={[
            { value: "all", label: `All${totalPages ? ` ${totalPages}` : ""}` },
            { value: "range", label: "Choose pages", disabled: !rangeable },
          ]}
          onChange={(v) => set("pages", v)}
        />
      </div>

      {config.pages === "range" && rangeable ? (
        <div>
          <label htmlFor="page-range" className="editorial-label block mb-2">
            Pages to print · of {totalPages}
          </label>
          <input
            id="page-range"
            value={config.pageRange}
            onChange={(e) => set("pageRange", e.target.value)}
            placeholder="e.g. 1-3, 7, 10-"
            className={cx("pl-input", rangeError && "error")}
            aria-invalid={rangeError ? true : undefined}
          />
          <p className={cx("text-xs mt-1", rangeError ? "text-persimmon font-semibold" : "text-fog")}>
            {rangeError ?? "Only these pages are printed and charged."}
          </p>
        </div>
      ) : null}

      <fieldset className="border-2 border-ink p-4 bg-paper-light">
        <legend className="editorial-label px-1">Print quality</legend>
        <div className="grid grid-cols-3 gap-2">
          {QUALITIES.map((q) => (
            <button
              key={q.value}
              type="button"
              aria-pressed={config.qualityDpi === q.value}
              onClick={() => set("qualityDpi", q.value)}
              className={cx(
                "border-2 p-2 text-left transition-colors",
                config.qualityDpi === q.value ? "border-persimmon bg-persimmon text-paper" : "border-ink/30 hover:border-ink",
              )}
            >
              <span className="block font-bold text-sm">{q.label}</span>
              <span className="block text-[11px] opacity-75">{q.hint}</span>
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
