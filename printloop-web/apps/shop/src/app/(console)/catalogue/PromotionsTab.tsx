"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button, DataTable, Dialog, ErrorState, Input, Pill, Select, Skeleton, Textarea, formatDate } from "@printloop/ui";
import { errorMessage, unwrap, type Schemas } from "@printloop/api-client";
import { useApi, useApiClient } from "@printloop/api-client/react";
import { useAction } from "@printloop/auth/actions";
import { useCanManage } from "@/lib/shop-context";

type Promo = Schemas["Promotion"];
type PromoInput = Schemas["PromotionInput"];

function toLocal(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function describe(p: Pick<Promo, "discountType" | "discountValue">) {
  if (p.discountType === "percentage") return `${p.discountValue}% off`;
  if (p.discountType === "fixed") return `₦${p.discountValue} off`;
  return `${p.discountValue} free page${p.discountValue === 1 ? "" : "s"}`;
}

function PromoDialog({ promo, open, onOpenChange }: { promo: Promo | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const client = useApiClient();
  const { run, isPending } = useAction();
  const [form, setForm] = useState<PromoInput>(() => ({
    code: promo?.code ?? "",
    name: promo?.name ?? "",
    description: promo?.description ?? "",
    discountType: promo?.discountType ?? "percentage",
    discountValue: promo?.discountValue ?? 10,
    status: promo?.status === "inactive" ? "inactive" : "active",
    maxUses: promo?.maxUses ?? null,
    startsAt: promo?.startsAt ?? null,
    endsAt: promo?.endsAt ?? null,
  }));
  const set = <K extends keyof PromoInput>(k: K, v: PromoInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const valid = /^[A-Z0-9-]{3,32}$/.test(String(form.code)) && String(form.name).trim().length > 1 && Number(form.discountValue) > 0 && !(form.discountType === "percentage" && Number(form.discountValue) > 100);
  const submit = () =>
    run(
      "save",
      () =>
        unwrap(
          promo
            ? client.PATCH("/saas/promotions/{id}", { params: { path: { id: promo.id } }, body: form })
            : client.POST("/saas/promotions", { body: form }),
        ),
      { success: promo ? "Promotion updated." : "Promotion created.", invalidate: ["/saas/promotions"] },
    ).then((r) => r && onOpenChange(false));
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={promo ? `Edit ${promo.code}` : "New promo code"}
      footer={
        <Button size="sm" disabled={!valid} loading={isPending("save")} onClick={submit}>
          {promo ? "Save" : "Create"}
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-x-3">
        <Input label="Code" value={String(form.code)} onChange={(e) => set("code", e.target.value.toUpperCase().replace(/\s/g, ""))} helper="Letters, numbers, dashes" className="pl-mono uppercase" />
        <Input label="Name" value={String(form.name)} onChange={(e) => set("name", e.target.value)} />
        <Select
          label="Discount"
          value={form.discountType}
          onChange={(e) => set("discountType", e.target.value as PromoInput["discountType"])}
          options={[
            { value: "percentage", label: "Percent off" },
            { value: "fixed", label: "Naira off" },
            { value: "free_pages", label: "Free pages" },
          ]}
        />
        <Input label="Amount" type="number" min={1} value={Number(form.discountValue)} onChange={(e) => set("discountValue", Number(e.target.value))} />
        <Input label="Starts" type="datetime-local" value={toLocal(form.startsAt)} onChange={(e) => set("startsAt", e.target.value ? new Date(e.target.value).toISOString() : null)} />
        <Input label="Ends" type="datetime-local" value={toLocal(form.endsAt)} onChange={(e) => set("endsAt", e.target.value ? new Date(e.target.value).toISOString() : null)} />
        <Input label="Max uses" type="number" min={1} value={form.maxUses ?? ""} placeholder="Unlimited" onChange={(e) => set("maxUses", e.target.value ? Number(e.target.value) : null)} />
        <Select
          label="Status"
          value={form.status}
          onChange={(e) => set("status", e.target.value as PromoInput["status"])}
          options={[
            { value: "active", label: "Active" },
            { value: "inactive", label: "Paused" },
          ]}
        />
      </div>
      <Textarea label="Note (optional)" rows={2} value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} />
    </Dialog>
  );
}

export function PromotionsTab() {
  const $api = useApi();
  const client = useApiClient();
  const manage = useCanManage();
  const { run } = useAction();
  const [editing, setEditing] = useState<Promo | null>(null);
  const [creating, setCreating] = useState(false);
  const q = $api.useQuery("get", "/saas/promotions");
  if (q.error) return <ErrorState message={errorMessage(q.error)} />;
  if (q.isLoading) return <Skeleton className="h-48" />;
  return (
    <div className="space-y-4">
      {manage ? (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} /> New code
          </Button>
        </div>
      ) : null}
      <DataTable<Promo>
        rows={q.data?.data?.promotions ?? []}
        rowKey={(p) => p.id}
        onRowClick={manage ? setEditing : undefined}
        empty="No promo codes yet. Try a launch code like WELCOME10."
        columns={[
          { label: "Code", cell: (p) => <span className="pl-mono font-bold">{p.code}</span> },
          { label: "Offer", cell: (p) => describe(p) },
          { label: "Used", cell: (p) => `${p.usageCount ?? 0}${p.maxUses ? ` / ${p.maxUses}` : ""}` },
          { label: "Runs", hideOnMobile: true, cell: (p) => `${p.startsAt ? formatDate(p.startsAt) : "Now"} → ${p.endsAt ? formatDate(p.endsAt) : "no end"}` },
          { label: "Status", cell: (p) => <Pill tone={p.status === "active" ? "sage" : "fog"}>{p.status}</Pill> },
          {
            label: "",
            align: "right",
            cell: (p) =>
              manage ? (
                <button
                  type="button"
                  className="text-xs pl-link"
                  onClick={(e) => {
                    e.stopPropagation();
                    void run("del", () => unwrap(client.DELETE("/saas/promotions/{id}", { params: { path: { id: p.id } } })), { success: "Deleted.", invalidate: ["/saas/promotions"] });
                  }}
                >
                  Delete
                </button>
              ) : null,
          },
        ]}
      />
      {creating ? <PromoDialog promo={null} open={creating} onOpenChange={setCreating} /> : null}
      {editing ? <PromoDialog key={editing.id} promo={editing} open onOpenChange={(o) => !o && setEditing(null)} /> : null}
    </div>
  );
}
