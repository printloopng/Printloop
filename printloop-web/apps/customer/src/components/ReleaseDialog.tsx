"use client";

import { useState } from "react";
import { Printer, Wifi, WifiOff } from "lucide-react";
import { Button, Dialog, InlineLoader, Notice, cx, toast } from "@printloop/ui";
import { errorMessage, unwrap } from "@printloop/api-client";
import { useApi, useApiClient } from "@printloop/api-client/react";
import { useInvalidateJobs } from "@/lib/queries";

export function ReleaseDialog({
  jobId,
  open,
  onOpenChange,
}: {
  jobId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const $api = useApi();
  const client = useApiClient();
  const invalidate = useInvalidateJobs();
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const kiosks = $api.useQuery(
    "get",
    "/customer/print-jobs/{id}/kiosks",
    { params: { path: { id: jobId } } },
    { enabled: open },
  );
  const list = kiosks.data?.data?.kiosks ?? [];

  const release = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await unwrap(
        client.POST("/customer/print-jobs/{id}/release", {
          params: { path: { id: jobId } },
          body: { kioskId: selected },
        }),
      );
      toast.success("Sent. Your pages are on their way to the printer.");
      await invalidate();
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err, "Could not send to that printer."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Send to a printer"
      description="Pick the station you're standing at. It starts printing within seconds."
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={release} disabled={!selected} loading={busy} arrow>
            Print now
          </Button>
        </>
      }
    >
      {kiosks.isLoading ? (
        <InlineLoader label="Finding printers…" />
      ) : kiosks.error ? (
        <Notice tone="danger">{errorMessage(kiosks.error)}</Notice>
      ) : list.length === 0 ? (
        <Notice tone="warn" title="No printers here yet">
          This shop has no stations set up. Show your code at the counter instead.
        </Notice>
      ) : (
        <ul className="space-y-2" role="radiogroup" aria-label="Printers">
          {list.map((k) => {
            const active = selected === k.id;
            return (
              <li key={k.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={!k.online}
                  onClick={() => setSelected(k.id ?? null)}
                  className={cx(
                    "w-full text-left border-2 p-3 flex items-center gap-3 transition-all",
                    active ? "border-persimmon bg-persimmon/10" : "border-ink hover:bg-paper-warm",
                    !k.online && "opacity-50 cursor-not-allowed",
                  )}
                >
                  <Printer size={20} className="shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block font-bold truncate">{k.name}</span>
                    {k.location ? <span className="block text-xs text-fog truncate">{k.location}</span> : null}
                  </span>
                  <span className={cx("flex items-center gap-1 text-[10px] font-bold tracking-editorial uppercase", k.online ? "text-sage" : "text-fog")}>
                    {k.online ? <Wifi size={13} /> : <WifiOff size={13} />}
                    {k.online ? "Online" : "Offline"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}
