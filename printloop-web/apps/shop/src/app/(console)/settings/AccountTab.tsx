"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button, Card, Dialog, Input, Notice, Section } from "@printloop/ui";
import { unwrap } from "@printloop/api-client";
import { useApiClient } from "@printloop/api-client/react";
import { signOut } from "@printloop/auth/client";
import { downloadFromApi } from "@/lib/download";
import { useAction } from "@/lib/actions";
import { useCanManage, useIsOwner, useShopProfile } from "@/lib/shop-context";

function lastMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function AccountTab() {
  const shop = useShopProfile();
  const client = useApiClient();
  const manage = useCanManage();
  const owner = useIsOwner();
  const { run, isPending } = useAction();
  const [month, setMonth] = useState(lastMonth);
  const [exporting, setExporting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [typed, setTyped] = useState("");

  return (
    <div className="space-y-2">
      <Section title="Monthly statement" description="Every order, fee and payout for one month, as a spreadsheet.">
        <Card className="max-w-xl flex flex-wrap items-end gap-3">
          <Input label="Month" type="month" value={month} max={new Date().toISOString().slice(0, 7)} onChange={(e) => setMonth(e.target.value)} className="w-44" />
          <Button size="sm" variant="ghost" disabled={!month} onClick={() => void downloadFromApi(`/saas/me/statement?month=${month}`, `printloop-statement-${month}.csv`)}>
            <Download size={14} /> Download CSV
          </Button>
        </Card>
      </Section>

      {manage ? (
        <Section title="Export everything" description="A copy of all your shop's data: jobs, payments, customers, prices and settings.">
          <Card className="max-w-xl">
            <Button
              size="sm"
              variant="ghost"
              loading={exporting}
              onClick={async () => {
                setExporting(true);
                await downloadFromApi("/saas/me/export", `printloop-${shop.slug}-export.json`, "POST");
                setExporting(false);
              }}
            >
              <Download size={14} /> Export shop data
            </Button>
          </Card>
        </Section>
      ) : null}

      {owner ? (
        <Section title="Close this shop" description="Stops new orders, removes your listing and deletes your shop's data after any money owed is settled.">
          <Card className="max-w-xl border-persimmon">
            <Notice tone="danger">This can&apos;t be undone. Export your data first.</Notice>
            <div className="mt-3">
              <Button size="sm" variant="dark" onClick={() => setClosing(true)}>
                Close shop…
              </Button>
            </div>
          </Card>
        </Section>
      ) : null}

      <Dialog
        open={closing}
        onOpenChange={(o) => {
          setClosing(o);
          if (!o) setTyped("");
        }}
        title={`Close ${shop.name}?`}
        description={`Type ${shop.slug} to confirm.`}
        footer={
          <Button
            size="sm"
            variant="dark"
            disabled={typed !== shop.slug}
            loading={isPending("close")}
            onClick={async () => {
              const r = await run("close", () => unwrap(client.DELETE("/saas/me")), { success: "Your shop is closed." });
              if (r) await signOut("/login");
            }}
          >
            Close shop permanently
          </Button>
        }
      >
        <Input label="Shop handle" value={typed} onChange={(e) => setTyped(e.target.value.trim())} className="pl-mono" autoComplete="off" />
      </Dialog>
    </div>
  );
}
