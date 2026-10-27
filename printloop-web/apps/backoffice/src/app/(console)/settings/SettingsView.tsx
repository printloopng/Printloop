"use client";

import { useMemo, useState } from "react";
import { Button, Card, ErrorState, PageHeader, Pill, Section, Skeleton } from "@printloop/ui";
import { errorMessage, unwrap, type Schemas } from "@printloop/api-client";
import { useApi, useApiClient } from "@printloop/api-client/react";
import { useAction } from "@/lib/actions";

type Setting = Schemas["SystemSetting"];

function parse(setting: Setting, draft: string): { ok: true; value: unknown } | { ok: false; error: string } {
  switch (setting.valueType) {
    case "boolean":
      return { ok: true, value: draft === "true" };
    case "number": {
      const n = Number(draft);
      return draft.trim() !== "" && Number.isFinite(n) ? { ok: true, value: n } : { ok: false, error: "Enter a number" };
    }
    case "json":
      try {
        return { ok: true, value: JSON.parse(draft) };
      } catch {
        return { ok: false, error: "Not valid JSON" };
      }
    default:
      return { ok: true, value: draft };
  }
}

function SettingRow({ setting }: { setting: Setting }) {
  const client = useApiClient();
  const { run, isPending } = useAction();
  const [draft, setDraft] = useState(setting.value);
  const changed = draft !== setting.value;
  const parsed = parse(setting, draft);
  const locked = Boolean(setting.isReadOnly);

  const save = (override?: string) => {
    const next = override ?? draft;
    const result = parse(setting, next);
    if (!result.ok) return;
    return run(setting.key, () => unwrap(client.PATCH("/platform/settings/{key}", { params: { path: { key: setting.key } }, body: { value: result.value } })), {
      success: `${setting.key} saved.`,
      invalidate: ["/platform/settings"],
    });
  };

  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_minmax(0,18rem)_auto] items-start py-4 border-t border-ink/15 first:border-t-0">
      <div>
        <div className="pl-mono text-sm font-bold break-all">{setting.key}</div>
        {setting.description ? <p className="text-sm text-ink/70 mt-0.5">{setting.description}</p> : null}
        {locked ? (
          <div className="mt-1">
            <Pill tone="fog">Read only</Pill>
          </div>
        ) : null}
      </div>
      <div>
        {setting.valueType === "boolean" ? (
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4 accent-persimmon"
              disabled={locked || isPending(setting.key)}
              checked={setting.value === "true"}
              onChange={(e) => void save(String(e.target.checked))}
            />
            {setting.value === "true" ? "On" : "Off"}
          </label>
        ) : setting.valueType === "json" ? (
          <textarea aria-label={setting.key} rows={4} disabled={locked} value={draft} onChange={(e) => setDraft(e.target.value)} className="pl-input pl-mono text-xs" />
        ) : (
          <input aria-label={setting.key} type={setting.valueType === "number" ? "number" : "text"} disabled={locked} value={draft} onChange={(e) => setDraft(e.target.value)} className="pl-input pl-mono" />
        )}
        {changed && !parsed.ok ? <p className="text-xs text-persimmon font-semibold mt-1">{parsed.error}</p> : null}
      </div>
      <div className="sm:text-right">
        {setting.valueType !== "boolean" && !locked ? (
          <Button size="sm" disabled={!changed || !parsed.ok} loading={isPending(setting.key)} onClick={() => void save()}>
            Save
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function SettingsView() {
  const $api = useApi();
  const q = $api.useQuery("get", "/platform/settings");
  const groups = useMemo(() => {
    const map = new Map<string, Setting[]>();
    for (const s of q.data?.data?.settings ?? []) {
      const key = s.category || "General";
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [q.data]);

  return (
    <div className="space-y-8">
      <PageHeader kicker="System" title="Settings" description="Platform-wide behaviour. Changes apply to every shop, usually within a minute." />
      {q.error ? (
        <ErrorState message={errorMessage(q.error)} />
      ) : q.isLoading ? (
        <Skeleton className="h-72" />
      ) : (
        groups.map(([category, rows]) => (
          <Section key={category} title={category}>
            <Card className="!py-0">
              {rows.map((s) => (
                <SettingRow key={`${s.key}-${s.updatedAt}`} setting={s} />
              ))}
            </Card>
          </Section>
        ))
      )}
    </div>
  );
}
