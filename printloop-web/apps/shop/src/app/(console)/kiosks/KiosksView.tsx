"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Printer, Wifi, WifiOff } from "lucide-react";
import { Button, Dialog, EmptyState, ErrorState, Input, PageHeader, Pill, Skeleton, timeAgo } from "@printloop/ui";
import { errorMessage, unwrap } from "@printloop/api-client";
import { useApi, useApiClient } from "@printloop/api-client/react";
import { useAction } from "@printloop/auth/actions";
import { useCanManage } from "@/lib/shop-context";
import { KeyReveal } from "@/components/KeyReveal";

function AddKiosk({ onCreated }: { onCreated: (key: string) => void }) {
  const client = useApiClient();
  const { run, isPending } = useAction();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [printerName, setPrinterName] = useState("");
  const submit = async () => {
    if (!name.trim()) return;
    const data = await run(
      "create",
      () => unwrap(client.POST("/saas/kiosks", { body: { name: name.trim(), location: location.trim() || undefined, printerName: printerName.trim() || undefined } })),
      { invalidate: ["/saas/kiosks", "/saas/ops/summary"] },
    );
    if (data?.kiosk.apiKey) {
      setOpen(false);
      setName("");
      setLocation("");
      setPrinterName("");
      onCreated(data.kiosk.apiKey);
    }
  };
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus size={15} /> Add kiosk
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Add a kiosk"
        description="A kiosk is a computer next to a printer running the PrintLoop Kiosk app."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" loading={isPending("create")} disabled={!name.trim()} onClick={submit}>
              Create &amp; get key
            </Button>
          </>
        }
      >
        <Input label="Name" placeholder="e.g. Front counter" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Where is it?" placeholder="e.g. Ground floor, by the entrance" value={location} onChange={(e) => setLocation(e.target.value)} />
        <Input label="Printer model (optional)" placeholder="e.g. HP LaserJet M404" value={printerName} onChange={(e) => setPrinterName(e.target.value)} />
      </Dialog>
    </>
  );
}

export function KiosksView() {
  const $api = useApi();
  const manage = useCanManage();
  const [key, setKey] = useState<string | null>(null);
  const q = $api.useQuery("get", "/saas/kiosks", {}, { refetchInterval: 10_000 });
  const kiosks = q.data?.data?.kiosks ?? [];

  return (
    <div>
      <PageHeader
        kicker="Operations"
        title="Kiosks"
        description="Each kiosk pulls paid jobs for your shop every few seconds and prints them."
        actions={manage ? <AddKiosk onCreated={setKey} /> : null}
      />
      {q.error ? (
        <ErrorState message={errorMessage(q.error)} />
      ) : q.isLoading ? (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : kiosks.length ? (
        <ul className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {kiosks.map((k) => (
            <li key={k.id}>
              <Link href={`/kiosks/${k.id}`} className="pl-card flex flex-col gap-3 h-full">
                <div className="flex items-start justify-between gap-2">
                  <Printer size={24} className="text-ochre" />
                  <Pill tone={k.online ? "sage" : k.status === "MAINTENANCE" ? "ochre" : "fog"} live={k.online}>
                    {k.online ? "Online" : k.status === "ACTIVE" ? "Offline" : k.status.toLowerCase()}
                  </Pill>
                </div>
                <div>
                  <div className="font-serif text-xl font-bold">{k.name}</div>
                  <div className="text-sm text-fog">{k.location ?? "No location set"}</div>
                </div>
                <div className="mt-auto flex items-center justify-between text-xs text-ink/60">
                  <span className="inline-flex items-center gap-1.5">
                    {k.online ? <Wifi size={13} /> : <WifiOff size={13} />}
                    {k.lastSeenAt ? `Seen ${timeAgo(k.lastSeenAt)}` : "Never connected"}
                  </span>
                  <span>{k.totalJobsPrinted} printed</span>
                </div>
                {!k.testPrintPassedAt ? <div className="text-xs font-bold text-persimmon">Test print not confirmed</div> : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<Printer size={30} />}
          title="No kiosks yet"
          description="Add one, install the PrintLoop Kiosk app on the computer next to your printer, and paste the key."
          action={manage ? <AddKiosk onCreated={setKey} /> : null}
        />
      )}
      <KeyReveal apiKey={key} title="Your kiosk key" onClose={() => setKey(null)} />
    </div>
  );
}
