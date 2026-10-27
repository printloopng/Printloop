"use client";

import { useState } from "react";
import { Copy, Plus } from "lucide-react";
import { Button, Checkbox, ConfirmDialog, DataTable, Dialog, ErrorState, Input, Notice, Pill, Skeleton, timeAgo, toast } from "@printloop/ui";
import { errorMessage, unwrap, type Schemas } from "@printloop/api-client";
import { useApi, useApiClient } from "@printloop/api-client/react";
import { useAction } from "@/lib/actions";
import { useCanManage } from "@/lib/shop-context";

type Hook = Schemas["TenantWebhook"];
type HookEvent = Hook["events"][number];

const EVENTS: Array<{ value: HookEvent; label: string }> = [
  { value: "job.completed", label: "A job finished printing" },
  { value: "job.failed", label: "A job failed" },
  { value: "customer.signed_up", label: "A student signed up at your shop" },
  { value: "payout.paid", label: "A payout was sent" },
];

function CreateDialog({ onClose, onSecret }: { onClose: () => void; onSecret: (secret: string) => void }) {
  const client = useApiClient();
  const { run, isPending } = useAction();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("https://");
  const [events, setEvents] = useState<HookEvent[]>(["job.completed"]);
  const valid = name.trim().length > 1 && /^https:\/\/[^\s/]+\.[^\s]+/.test(url) && events.length > 0;
  const submit = () =>
    run("create", () => unwrap(client.POST("/saas/me/webhooks", { body: { name: name.trim(), url: url.trim(), events } })), { invalidate: ["/saas/me/webhooks"] }).then((r) => {
      if (!r) return;
      onClose();
      if (r.secret) onSecret(r.secret);
    });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="New webhook"
      description="We POST a signed JSON event to your HTTPS address when these things happen."
      footer={
        <Button size="sm" disabled={!valid} loading={isPending("create")} onClick={submit}>
          Create
        </Button>
      }
    >
      <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Google Sheet logger" />
      <Input label="HTTPS address" value={url} onChange={(e) => setUrl(e.target.value)} className="pl-mono" />
      <fieldset className="space-y-2 mt-2">
        <legend className="editorial-label mb-2">Send me</legend>
        {EVENTS.map((e) => (
          <Checkbox
            key={e.value}
            label={e.label}
            description={e.value}
            checked={events.includes(e.value)}
            onChange={(ev) => setEvents((cur) => (ev.target.checked ? [...cur, e.value] : cur.filter((x) => x !== e.value)))}
          />
        ))}
      </fieldset>
    </Dialog>
  );
}

function SecretDialog({ secret, onClose }: { secret: string | null; onClose: () => void }) {
  return (
    <Dialog
      open={Boolean(secret)}
      onOpenChange={(o) => !o && onClose()}
      dismissible={false}
      title="Signing secret"
      description="Use it to check the X-PrintLoop-Signature header. We never show it again."
      footer={
        <Button size="sm" onClick={onClose}>
          I&apos;ve saved it
        </Button>
      }
    >
      <div className="flex items-center gap-2 border-2 border-ink bg-ink text-paper p-3">
        <code className="pl-mono text-xs break-all flex-1">{secret}</code>
        <button type="button" aria-label="Copy secret" className="hover:text-persimmon" onClick={() => void navigator.clipboard.writeText(secret ?? "").then(() => toast.success("Copied."))}>
          <Copy size={16} />
        </button>
      </div>
    </Dialog>
  );
}

export function WebhooksTab() {
  const $api = useApi();
  const client = useApiClient();
  const manage = useCanManage();
  const { run } = useAction();
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Hook | null>(null);
  const q = $api.useQuery("get", "/saas/me/webhooks");
  if (q.error) return <ErrorState message={errorMessage(q.error)} />;
  if (q.isLoading) return <Skeleton className="h-40" />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink/70 max-w-xl">Connect PrintLoop to your own tools. Each request is signed so you can trust it came from us.</p>
        {manage ? (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} /> New webhook
          </Button>
        ) : null}
      </div>
      {!manage ? <Notice tone="info">Only owners and admins can manage webhooks.</Notice> : null}
      <DataTable<Hook>
        rows={q.data?.data ?? []}
        rowKey={(h) => h.id}
        empty="No webhooks."
        columns={[
          {
            label: "Webhook",
            cell: (h) => (
              <div>
                <div className="font-semibold">{h.name}</div>
                <div className="pl-mono text-xs text-fog break-all">{h.url}</div>
              </div>
            ),
          },
          { label: "Events", hideOnMobile: true, cell: (h) => <span className="text-xs">{h.events.join(", ")}</span> },
          {
            label: "Health",
            cell: (h) =>
              h.lastFailureAt && (!h.lastSuccessAt || h.lastFailureAt > h.lastSuccessAt) ? (
                <span title={h.lastFailureReason ?? undefined}>
                  <Pill tone="persimmon">Failing</Pill>
                </span>
              ) : h.lastSuccessAt ? (
                <span className="text-xs text-fog">OK {timeAgo(h.lastSuccessAt)}</span>
              ) : (
                <span className="text-xs text-fog">No calls yet</span>
              ),
          },
          {
            label: "On",
            cell: (h) => (
              <input
                type="checkbox"
                aria-label={`Enable ${h.name}`}
                className="h-4 w-4 accent-persimmon"
                checked={h.isActive}
                disabled={!manage}
                onChange={(e) =>
                  void run("toggle", () => unwrap(client.PATCH("/saas/me/webhooks/{id}", { params: { path: { id: h.id } }, body: { isActive: e.target.checked } })), {
                    invalidate: ["/saas/me/webhooks"],
                  })
                }
              />
            ),
          },
          {
            label: "",
            align: "right",
            cell: (h) =>
              manage ? (
                <button type="button" className="text-xs pl-link" onClick={() => setDeleting(h)}>
                  Delete
                </button>
              ) : null,
          },
        ]}
      />
      {creating ? <CreateDialog onClose={() => setCreating(false)} onSecret={setSecret} /> : null}
      <SecretDialog secret={secret} onClose={() => setSecret(null)} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name ?? ""}?`}
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!deleting) return;
          await run("delete", () => unwrap(client.DELETE("/saas/me/webhooks/{id}", { params: { path: { id: deleting.id } } })), {
            success: "Webhook deleted.",
            invalidate: ["/saas/me/webhooks"],
            rethrow: true,
          });
          setDeleting(null);
        }}
      />
    </div>
  );
}
