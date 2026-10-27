"use client";

import { useState } from "react";
import { Copy, KeyRound } from "lucide-react";
import { Button, Card, ConfirmDialog, Dialog, ErrorState, Notice, Section, Skeleton, toast } from "@printloop/ui";
import { errorMessage, unwrap } from "@printloop/api-client";
import { useApi, useApiClient } from "@printloop/api-client/react";
import { useAction } from "@/lib/actions";
import { useCanManage } from "@/lib/shop-context";

export function IntegrationsTab() {
  const $api = useApi();
  const client = useApiClient();
  const manage = useCanManage();
  const { run } = useAction();
  const [confirming, setConfirming] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const q = $api.useQuery("get", "/saas/me/lms");
  if (q.error) return <ErrorState message={errorMessage(q.error)} />;
  if (q.isLoading) return <Skeleton className="h-40 max-w-xl" />;
  const keySet = Boolean(q.data?.data?.keySet);

  return (
    <Section title="Learning platform (LMS)" description="Let lecturers send students from Moodle, Canvas or your school portal straight to your print page, already signed in.">
      <Card className="max-w-xl space-y-3">
        <p className="text-sm">
          Status: <strong>{keySet ? "Key issued" : "Not connected"}</strong>
        </p>
        <p className="text-sm text-ink/70">Give the key to your school&apos;s IT team. Making a new key stops the old one working immediately.</p>
        {manage ? (
          <Button size="sm" variant={keySet ? "ghost" : "primary"} onClick={() => (keySet ? setConfirming(true) : void issue())}>
            <KeyRound size={14} /> {keySet ? "Make a new key" : "Create key"}
          </Button>
        ) : (
          <Notice tone="info">Only owners and admins can manage integration keys.</Notice>
        )}
      </Card>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Replace the LMS key?"
        description="The current key stops working straight away. Your school will need the new one."
        confirmLabel="Replace key"
        destructive
        onConfirm={async () => {
          await issue();
          setConfirming(false);
        }}
      />
      <Dialog
        open={Boolean(key)}
        onOpenChange={(o) => !o && setKey(null)}
        dismissible={false}
        title="Your LMS key"
        description="Copy it now. For security we never show it again."
        footer={
          <Button size="sm" onClick={() => setKey(null)}>
            I&apos;ve saved it
          </Button>
        }
      >
        <div className="flex items-center gap-2 border-2 border-ink bg-ink text-paper p-3">
          <code className="pl-mono text-xs break-all flex-1">{key}</code>
          <button type="button" aria-label="Copy key" className="hover:text-persimmon" onClick={() => void navigator.clipboard.writeText(key ?? "").then(() => toast.success("Copied."))}>
            <Copy size={16} />
          </button>
        </div>
      </Dialog>
    </Section>
  );

  async function issue() {
    const r = await run("issue", () => unwrap(client.POST("/saas/me/lms/regenerate")), { invalidate: ["/saas/me/lms"] });
    if (r?.key) setKey(r.key);
  }
}
