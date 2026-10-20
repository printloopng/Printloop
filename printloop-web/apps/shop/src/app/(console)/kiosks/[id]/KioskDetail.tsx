"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, KeyRound, PlugZap, Printer, Trash2 } from "lucide-react";
import {
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  InlineLoader,
  Input,
  KeyValue,
  PageHeader,
  Section,
  Select,
  Textarea,
  formatDateTime,
  toast,
} from "@printloop/ui";
import { errorMessage, unwrap, type Schemas } from "@printloop/api-client";
import { useApi, useApiClient } from "@printloop/api-client/react";
import { useAction } from "@/lib/actions";
import { useCanManage } from "@/lib/shop-context";
import { KeyReveal } from "@/components/KeyReveal";

type Kiosk = Schemas["Kiosk"];

function EditForm({ kiosk }: { kiosk: Kiosk }) {
  const client = useApiClient();
  const { run, isPending } = useAction();
  const [form, setForm] = useState({
    name: kiosk.name ?? "",
    location: kiosk.location ?? "",
    campus: kiosk.campus ?? "",
    printerName: kiosk.printerName ?? "",
    ipAddress: kiosk.ipAddress ?? "",
    mapsUrl: kiosk.mapsUrl ?? "",
    notes: kiosk.notes ?? "",
    isPublic: kiosk.isPublic ?? true,
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = () =>
    run("save", () => unwrap(client.PATCH("/saas/kiosks/{id}", { params: { path: { id: kiosk.id } }, body: form })), {
      success: "Saved.",
      invalidate: ["/saas/kiosks/{id}", "/saas/kiosks"],
    });
  return (
    <Card>
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Input label="Name" value={form.name} onChange={set("name")} />
        <Input label="Location" value={form.location} onChange={set("location")} />
        <Input label="Campus" value={form.campus} onChange={set("campus")} />
        <Input label="Printer model" value={form.printerName} onChange={set("printerName")} />
        <Input label="Printer address (IPP)" placeholder="192.168.1.20" value={form.ipAddress} onChange={set("ipAddress")} helper="Only for direct cloud printing. The kiosk app finds printers itself." />
        <Input label="Directions link" placeholder="https://maps.google.com/…" value={form.mapsUrl} onChange={set("mapsUrl")} />
      </div>
      <Textarea label="Notes for your team" rows={2} value={form.notes} onChange={set("notes")} />
      <Checkbox checked={form.isPublic} onChange={(e) => setForm((f) => ({ ...f, isPublic: e.target.checked }))} label="Show to customers" description="Listed on your Stations page so students know where to collect." />
      <div className="flex justify-end mt-4">
        <Button size="sm" loading={isPending("save")} onClick={save}>
          Save changes
        </Button>
      </div>
    </Card>
  );
}

export function KioskDetail({ id }: { id: string }) {
  const $api = useApi();
  const client = useApiClient();
  const router = useRouter();
  const manage = useCanManage();
  const { run, isPending } = useAction();
  const [key, setKey] = useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const q = $api.useQuery("get", "/saas/kiosks/{id}", { params: { path: { id } } }, { refetchInterval: 10_000 });
  const kiosk = q.data?.data?.kiosk;
  const path = { params: { path: { id } } };

  if (q.isLoading) return <InlineLoader />;
  if (!kiosk) return <EmptyState title="Kiosk not found" description={q.error ? errorMessage(q.error) : undefined} action={<Link href="/kiosks" className="pl-btn-primary">All kiosks</Link>} />;

  const test = async (kind: "test-connection" | "test-print") => {
    const result = await run(kind, () =>
      unwrap(kind === "test-connection" ? client.POST("/saas/kiosks/{id}/test-connection", path) : client.POST("/saas/kiosks/{id}/test-print", path)),
    );
    if (result) toast.success(kind === "test-connection" ? "The kiosk answered." : "Test page sent. Check the printer, then confirm below.");
  };

  return (
    <div className="space-y-6">
      <Link href="/kiosks" className="inline-flex items-center gap-1.5 editorial-label text-ink/50 hover:text-persimmon">
        <ArrowLeft size={13} /> Kiosks
      </Link>
      <PageHeader
        kicker="Kiosk"
        title={kiosk.name}
        description={kiosk.location ?? undefined}
        actions={
          manage ? (
            <Select
              aria-label="Status"
              wrapperClassName="mb-0"
              value={kiosk.status}
              onChange={(e) =>
                run("status", () => unwrap(client.PATCH("/saas/kiosks/{id}/status", { ...path, body: { status: e.target.value as Kiosk["status"] } })), {
                  success: "Status updated.",
                  invalidate: ["/saas/kiosks/{id}", "/saas/kiosks"],
                })
              }
              options={[
                { value: "ACTIVE", label: "Active" },
                { value: "MAINTENANCE", label: "Maintenance" },
                { value: "DISABLED", label: "Disabled" },
              ]}
            />
          ) : null
        }
      />
      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6 items-start">
        <div className="space-y-6">
          {manage ? <EditForm key={kiosk.updatedAt} kiosk={kiosk} /> : null}
          <Section title="Check the setup">
            <Card className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" loading={isPending("test-connection")} onClick={() => test("test-connection")}>
                  <PlugZap size={14} /> Test connection
                </Button>
                {manage ? (
                  <Button size="sm" variant="dark" loading={isPending("test-print")} onClick={() => test("test-print")}>
                    <Printer size={14} /> Print test page
                  </Button>
                ) : null}
                {manage ? (
                  <Button
                    size="sm"
                    loading={isPending("pass")}
                    onClick={() => run("pass", () => unwrap(client.POST("/saas/kiosks/{id}/test-print-pass", path)), { success: "Confirmed. This kiosk is ready.", invalidate: ["/saas/kiosks/{id}", "/saas/ops/summary"] })}
                  >
                    <CheckCircle2 size={14} /> It printed correctly
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-fog">A confirmed test print is one of the steps before your shop goes live.</p>
            </Card>
          </Section>
        </div>
        <div className="space-y-6">
          <Card>
            <KeyValue
              items={[
                ["Last seen", formatDateTime(kiosk.lastSeenAt)],
                ["Last printed", formatDateTime(kiosk.lastPrintedAt)],
                ["Jobs printed", String(kiosk.totalJobsPrinted ?? 0)],
                ["Pages printed", String(kiosk.totalPagesPrinted ?? 0)],
                ["Added", formatDateTime(kiosk.createdAt)],
              ]}
            />
          </Card>
          {manage ? (
            <Card className="space-y-3">
              <h3 className="font-serif text-lg font-bold">Security</h3>
              <Button size="sm" variant="ghost" onClick={() => setConfirmRotate(true)}>
                <KeyRound size={14} /> Rotate kiosk key
              </Button>
              <Button size="sm" variant="ghost" className="text-persimmon" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={14} /> Remove kiosk
              </Button>
            </Card>
          ) : null}
        </div>
      </div>
      <ConfirmDialog
        open={confirmRotate}
        onOpenChange={setConfirmRotate}
        title="Rotate the kiosk key?"
        description="The kiosk stops receiving jobs until you paste the new key into the kiosk app."
        confirmLabel="Rotate"
        onConfirm={async () => {
          const data = await run("rotate", () => unwrap(client.POST("/saas/kiosks/{id}/regenerate-key", path)), { rethrow: true });
          if (data?.apiKey) setKey(data.apiKey);
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Remove ${kiosk.name}?`}
        description="Jobs already sent to it go back to the queue."
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          await run("delete", () => unwrap(client.DELETE("/saas/kiosks/{id}", path)), { success: "Kiosk removed.", invalidate: ["/saas/kiosks"], rethrow: true });
          router.push("/kiosks");
        }}
      />
      <KeyReveal apiKey={key} title="New kiosk key" onClose={() => setKey(null)} />
    </div>
  );
}
