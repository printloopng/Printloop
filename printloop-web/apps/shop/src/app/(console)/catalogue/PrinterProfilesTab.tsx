"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button, Checkbox, DataTable, Dialog, ErrorState, Input, Pill, Select, Skeleton } from "@printloop/ui";
import { errorMessage, unwrap, type Schemas } from "@printloop/api-client";
import { useApi, useApiClient } from "@printloop/api-client/react";
import { useAction } from "@/lib/actions";
import { useCanManage } from "@/lib/shop-context";

type Profile = Schemas["PrinterProfile"];
type Caps = Schemas["PrinterCapabilities"];

function ProfileDialog({ profile, onClose }: { profile: Profile | null; onClose: () => void }) {
  const client = useApiClient();
  const { run, isPending } = useAction();
  const [name, setName] = useState(profile?.displayName ?? "");
  const [ippUri, setIpp] = useState(profile?.ippUri ?? "");
  const [isDefault, setDefault] = useState(profile?.isDefault ?? false);
  const [caps, setCaps] = useState<Caps>(profile?.capabilities ?? { maxDpi: 600, colorMode: "bw", paperSize: "A4", duplex: true });
  const submit = () => {
    const body = { displayName: name.trim(), ippUri: ippUri.trim() || null, isDefault, capabilities: caps, driverKind: profile?.driverKind ?? "ipp" };
    return run(
      "save",
      () => unwrap(profile ? client.PATCH("/saas/printer-profiles/{id}", { params: { path: { id: profile.id } }, body }) : client.POST("/saas/printer-profiles", { body })),
      { success: "Saved.", invalidate: ["/saas/printer-profiles"] },
    ).then((r) => r && onClose());
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={profile ? `Edit ${profile.displayName}` : "New printer profile"}
      description="Tell PrintLoop what this printer can do, so customers can't order what it can't print."
      footer={
        <Button size="sm" disabled={name.trim().length < 2} loading={isPending("save")} onClick={submit}>
          Save
        </Button>
      }
    >
      <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Counter laser" />
      <Input label="IPP address (optional)" value={ippUri} onChange={(e) => setIpp(e.target.value)} placeholder="ipp://192.168.1.20/ipp/print" />
      <div className="grid grid-cols-3 gap-3">
        <Select label="Max quality" value={caps.maxDpi} onChange={(e) => setCaps({ ...caps, maxDpi: Number(e.target.value) as Caps["maxDpi"] })} options={[100, 300, 600].map((d) => ({ value: d, label: `${d} dpi` }))} />
        <Select
          label="Colour"
          value={caps.colorMode}
          onChange={(e) => setCaps({ ...caps, colorMode: e.target.value as Caps["colorMode"] })}
          options={[
            { value: "bw", label: "B&W only" },
            { value: "color", label: "Colour" },
          ]}
        />
        <Select label="Largest paper" value={caps.paperSize ?? "A4"} onChange={(e) => setCaps({ ...caps, paperSize: e.target.value })} options={["A4", "A3", "LETTER"].map((p) => ({ value: p, label: p }))} />
      </div>
      <Checkbox label="Prints double-sided" checked={Boolean(caps.duplex)} onChange={(e) => setCaps({ ...caps, duplex: e.target.checked })} />
      <div className="mt-2">
        <Checkbox label="Default printer" checked={isDefault} onChange={(e) => setDefault(e.target.checked)} />
      </div>
    </Dialog>
  );
}

export function PrinterProfilesTab() {
  const $api = useApi();
  const client = useApiClient();
  const manage = useCanManage();
  const { run } = useAction();
  const [editing, setEditing] = useState<Profile | null | "new">(null);
  const q = $api.useQuery("get", "/saas/printer-profiles");
  if (q.error) return <ErrorState message={errorMessage(q.error)} />;
  if (q.isLoading) return <Skeleton className="h-48" />;
  return (
    <div className="space-y-4">
      {manage ? (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus size={14} /> New profile
          </Button>
        </div>
      ) : null}
      <DataTable<Profile>
        rows={(q.data?.data ?? []) as Profile[]}
        rowKey={(p) => p.id}
        onRowClick={manage ? setEditing : undefined}
        empty="No printer profiles. Optional: add one to limit what customers can order."
        columns={[
          { label: "Name", cell: (p) => <span className="font-semibold">{p.displayName}</span> },
          { label: "Can print", cell: (p) => `${p.capabilities.colorMode === "color" ? "Colour" : "B&W"} · up to ${p.capabilities.maxDpi} dpi · ${p.capabilities.paperSize ?? "A4"}${p.capabilities.duplex ? " · duplex" : ""}` },
          { label: "", cell: (p) => (p.isDefault ? <Pill tone="ink">Default</Pill> : null) },
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
                    void run("del", () => unwrap(client.DELETE("/saas/printer-profiles/{id}", { params: { path: { id: p.id } } })), { success: "Deleted.", invalidate: ["/saas/printer-profiles"] });
                  }}
                >
                  Delete
                </button>
              ) : null,
          },
        ]}
      />
      {editing ? <ProfileDialog profile={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
