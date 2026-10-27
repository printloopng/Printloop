"use client";

import { useState } from "react";
import { Button, Card, Checkbox, ErrorState, Input, Notice, Skeleton, formatNaira } from "@printloop/ui";
import { errorMessage, unwrap, type Schemas } from "@printloop/api-client";
import { useApi, useApiClient } from "@printloop/api-client/react";
import { useAction } from "@printloop/auth/actions";
import { useCanManage } from "@/lib/shop-context";

function Form({ initial }: { initial: Schemas["EditPricing"] | undefined }) {
  const client = useApiClient();
  const manage = useCanManage();
  const { run, isPending } = useAction();
  const [enabled, setEnabled] = useState(Boolean(initial?.editingEnabled));
  const [baseFee, setBase] = useState(Number(initial?.baseFee ?? 500));
  const [perPageFee, setPer] = useState(Number(initial?.perPageFee ?? 100));
  const save = () =>
    run("save", () => unwrap(client.POST("/saas/edit-pricing", { body: { editingEnabled: enabled, baseFee, perPageFee } })), {
      success: "Editing fees saved.",
      invalidate: ["/saas/edit-pricing"],
    });
  return (
    <Card className="max-w-xl space-y-4">
      <Checkbox
        checked={enabled}
        disabled={!manage}
        onChange={(e) => setEnabled(e.target.checked)}
        label="Offer Edit & Print"
        description="Customers can ask you to fix their document before printing. They approve your edit before paying."
      />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Base fee (₦)" type="number" min={0} disabled={!manage || !enabled} value={baseFee} onChange={(e) => setBase(Math.max(0, Number(e.target.value)))} />
        <Input label="Per page (₦)" type="number" min={0} disabled={!manage || !enabled} value={perPageFee} onChange={(e) => setPer(Math.max(0, Number(e.target.value)))} />
      </div>
      <p className="text-sm text-ink/70">A 10-page edit would cost {formatNaira(baseFee + perPageFee * 10)} plus printing.</p>
      {manage ? (
        <Button size="sm" loading={isPending("save")} onClick={save}>
          Save
        </Button>
      ) : (
        <Notice tone="info">Only owners and admins can change fees.</Notice>
      )}
    </Card>
  );
}

export function EditingTab() {
  const $api = useApi();
  const q = $api.useQuery("get", "/saas/edit-pricing");
  if (q.error) return <ErrorState message={errorMessage(q.error)} />;
  if (q.isLoading) return <Skeleton className="h-48 max-w-xl" />;
  return <Form key={String(q.data?.data?.updatedAt ?? "new")} initial={q.data?.data} />;
}
