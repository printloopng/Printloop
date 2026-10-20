"use client";

import { useState } from "react";
import { Button, Dialog, Notice, Textarea, toast } from "@printloop/ui";
import { errorMessage, unwrap } from "@printloop/api-client";
import { useApiClient } from "@printloop/api-client/react";

const REASONS = ["Pages came out blank or faded", "Wrong pages or copies", "Printer jammed mid-job", "I was charged but nothing printed"];

export function DisputeDialog({ jobId, open, onOpenChange }: { jobId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const client = useApiClient();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (reason.trim().length < 5) return setError("Tell the shop what went wrong.");
    setBusy(true);
    setError(null);
    try {
      await unwrap(client.POST("/customer/disputes", { body: { printJobId: jobId, reason: reason.trim() } }));
      toast.success("Reported. The shop will review it and get back to you.");
      onOpenChange(false);
      setReason("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Report a problem"
      description="The shop sees this right away and can reprint or refund."
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" loading={busy} onClick={submit}>
            Send report
          </Button>
        </>
      }
    >
      {error ? (
        <div className="mb-3">
          <Notice tone="danger">{error}</Notice>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2 mb-4">
        {REASONS.map((r) => (
          <button key={r} type="button" className="pl-chip" onClick={() => setReason(r)}>
            {r}
          </button>
        ))}
      </div>
      <Textarea label="What happened?" rows={4} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} />
    </Dialog>
  );
}
