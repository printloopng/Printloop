"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Checkbox, Dialog, EmptyState, ErrorState, Notice, Select, Skeleton, cx, formatNaira } from "@printloop/ui";
import { errorMessage, unwrap, type Schemas } from "@printloop/api-client";
import { useApi, useApiClient } from "@printloop/api-client/react";
import { useAction } from "@printloop/auth/actions";
import { useCanManage } from "@/lib/shop-context";

type Row = Schemas["PricingConfig"];
type Input = Schemas["PricingInput"];
const CELLS = [
  ["price100Simplex", "price100Duplex", "Draft · 100 dpi"],
  ["price300Simplex", "price300Duplex", "Standard · 300 dpi"],
  ["price600Simplex", "price600Duplex", "Sharp · 600 dpi"],
] as const;
type CellKey = (typeof CELLS)[number][0] | (typeof CELLS)[number][1];

function PriceInput({ value, onChange, disabled, label }: { value: number | null | undefined; onChange: (v: number | null) => void; disabled: boolean; label: string }) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <span className="relative block">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-fog text-xs">₦</span>
        <input
          type="number"
          min={0}
          step="0.5"
          inputMode="decimal"
          disabled={disabled}
          value={value ?? ""}
          placeholder="—"
          onChange={(e) => onChange(e.target.value === "" ? null : Math.max(0, Number(e.target.value)))}
          className="pl-input pl-mono py-1.5 pl-6 text-right w-24"
        />
      </span>
    </label>
  );
}

function RowEditor({ row }: { row: Row }) {
  const client = useApiClient();
  const manage = useCanManage();
  const { run, isPending } = useAction();
  const [draft, setDraft] = useState<Partial<Record<CellKey, number | null>> & { isActive?: boolean }>({});
  const dirty = Object.keys(draft).length > 0;
  const val = (k: CellKey) => (k in draft ? draft[k] : row[k]);
  const save = () =>
    run("save", () => unwrap(client.PATCH("/saas/pricing/{id}", { params: { path: { id: row.id } }, body: draft as Input })), {
      success: `${row.paperSize} ${row.colorType === "COLOR" ? "colour" : "B&W"} prices saved.`,
      invalidate: ["/saas/pricing"],
    }).then((r) => r && setDraft({}));
  const remove = () =>
    run("delete", () => unwrap(client.DELETE("/saas/pricing/{id}", { params: { path: { id: row.id } } })), { success: "Row removed.", invalidate: ["/saas/pricing"] });
  const active = draft.isActive ?? row.isActive ?? true;
  return (
    <tr className={cx("border-t-2 border-ink/15", !active && "opacity-50")}>
      <th scope="row" className="px-4 py-3 text-left whitespace-nowrap">
        <div className="font-bold">{row.paperSize}</div>
        <div className="text-xs text-fog">{row.colorType === "COLOR" ? "Colour" : "Black & white"}</div>
      </th>
      {CELLS.map(([s, d, label]) => (
        <td key={s} className="px-3 py-3">
          <div className="flex flex-col gap-1.5">
            <PriceInput label={`${label} single-sided`} value={val(s)} disabled={!manage} onChange={(v) => setDraft((x) => ({ ...x, [s]: v }))} />
            <PriceInput label={`${label} double-sided`} value={val(d)} disabled={!manage} onChange={(v) => setDraft((x) => ({ ...x, [d]: v }))} />
          </div>
        </td>
      ))}
      <td className="px-3 py-3">
        {manage ? (
          <Checkbox label="Offered" checked={active} onChange={(e) => setDraft((x) => ({ ...x, isActive: e.target.checked }))} />
        ) : active ? (
          "Offered"
        ) : (
          "Hidden"
        )}
      </td>
      <td className="px-3 py-3 text-right whitespace-nowrap">
        {manage ? (
          <div className="flex justify-end gap-2">
            {dirty ? (
              <Button size="sm" loading={isPending("save")} onClick={save}>
                Save
              </Button>
            ) : null}
            <button type="button" aria-label={`Remove ${row.paperSize} ${row.colorType}`} className="text-ink/40 hover:text-persimmon" onClick={remove}>
              <Trash2 size={16} />
            </button>
          </div>
        ) : null}
      </td>
    </tr>
  );
}

function AddRow({ existing }: { existing: Row[] }) {
  const client = useApiClient();
  const { run, isPending } = useAction();
  const [open, setOpen] = useState(false);
  const [paperSize, setPaper] = useState<Input["paperSize"]>("A4");
  const [colorType, setColor] = useState<Input["colorType"]>("BLACK_WHITE");
  const [price, setPrice] = useState(10);
  const exists = existing.some((r) => r.paperSize === paperSize && r.colorType === colorType);
  const create = () =>
    run(
      "create",
      () =>
        unwrap(
          client.POST("/saas/pricing", {
            body: {
              paperSize,
              colorType,
              pricePerPage: price,
              price100Simplex: Math.max(1, Math.round(price * 0.7)),
              price300Simplex: price,
              price600Simplex: Math.round(price * 1.5),
              price100Duplex: Math.round(price * 1.2),
              price300Duplex: Math.round(price * 1.7),
              price600Duplex: Math.round(price * 2.5),
              isActive: true,
            },
          }),
        ),
      { success: "Added. Fine-tune each cell in the table.", invalidate: ["/saas/pricing"] },
    ).then((r) => r && setOpen(false));
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus size={14} /> Add paper or colour
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Add a price row"
        description="We fill in sensible defaults from your standard price; edit any cell afterwards."
        footer={
          <Button size="sm" disabled={exists} loading={isPending("create")} onClick={create}>
            Add
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Select label="Paper" value={paperSize} onChange={(e) => setPaper(e.target.value as Input["paperSize"])} options={["A4", "A3", "LETTER", "LEGAL"].map((p) => ({ value: p, label: p }))} />
          <Select
            label="Colour"
            value={colorType}
            onChange={(e) => setColor(e.target.value as Input["colorType"])}
            options={[
              { value: "BLACK_WHITE", label: "Black & white" },
              { value: "COLOR", label: "Colour" },
            ]}
          />
        </div>
        <label className="block">
          <span className="editorial-label block mb-1.5">Standard price per page (₦)</span>
          <input type="number" min={1} value={price} onChange={(e) => setPrice(Math.max(1, Number(e.target.value) || 1))} className="pl-input pl-mono" />
        </label>
        {exists ? <p className="text-xs text-persimmon font-semibold mt-2">You already have this row.</p> : null}
      </Dialog>
    </>
  );
}

export function PricingTab() {
  const $api = useApi();
  const manage = useCanManage();
  const q = $api.useQuery("get", "/saas/pricing");
  const rows = (q.data?.data?.configs ?? []) as Row[];
  if (q.error) return <ErrorState message={errorMessage(q.error)} />;
  if (q.isLoading) return <Skeleton className="h-64" />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink/70">
          Per printed page. Top box is single-sided, bottom is double-sided. Cheapest B&amp;W A4 now:{" "}
          <strong>{formatNaira(Math.min(...rows.filter((r) => r.paperSize === "A4" && r.colorType === "BLACK_WHITE").map((r) => Number(r.price300Simplex ?? r.pricePerPage)), Infinity) || 0)}</strong>
        </p>
        {manage ? <AddRow existing={rows} /> : null}
      </div>
      {!manage ? <Notice tone="info">Only owners and admins can change prices.</Notice> : null}
      {rows.length ? (
        <div className="border-2 border-ink overflow-x-auto bg-paper-light">
          <table className="w-full text-sm">
            <thead className="bg-ink text-paper">
              <tr>
                <th scope="col" className="pl-table-head">Paper</th>
                {CELLS.map(([, , label]) => (
                  <th key={label} scope="col" className="pl-table-head">
                    {label}
                  </th>
                ))}
                <th scope="col" className="pl-table-head">Status</th>
                <th scope="col" className="pl-table-head" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <RowEditor key={`${r.id}-${r.updatedAt}`} row={r} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="No prices yet" description="Add at least black & white A4 so customers can order." action={manage ? <AddRow existing={rows} /> : null} />
      )}
    </div>
  );
}
