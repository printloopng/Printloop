"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { Button, Card, ConfirmDialog, DataTable, Dialog, ErrorState, Input, KeyValue, Notice, PageHeader, Pill, Section, Skeleton, StatCard, Textarea, formatDateTime, formatNaira, formatNumber } from "@printloop/ui";
import { errorMessage, unwrap } from "@printloop/api-client";
import { useApi, useApiClient } from "@printloop/api-client/react";
import { appUrls } from "@printloop/auth/config";
import { useAction } from "@printloop/auth/actions";
import { TENANT_TONE } from "../TenantsView";

export function TenantDetail({ id }: { id: string }) {
  const $api = useApi();
  const client = useApiClient();
  const router = useRouter();
  const { run, isPending } = useAction();
  const [dialog, setDialog] = useState<"suspend" | "support" | "delete" | null>(null);
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [force, setForce] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const q = $api.useQuery("get", "/platform/tenants/{id}", { params: { path: { id } } });
  const tenant = q.data?.data?.tenant;
  const stats = q.data?.data?.stats;
  const members = q.data?.data?.members ?? [];
  const path = { params: { path: { id } } };
  const refresh = ["/platform/tenants/{id}", "/platform/tenants"];

  if (q.error) return <ErrorState message={errorMessage(q.error)} />;
  if (q.isLoading || !tenant) return <Skeleton className="h-96" />;

  const suspend = () =>
    run("suspend", () => unwrap(client.POST("/platform/tenants/{id}/suspend", { ...path, body: { reason: reason.trim() || undefined } })), { success: `${tenant.name} is suspended.`, invalidate: refresh }).then((r) => {
      if (r) {
        setDialog(null);
        setReason("");
      }
    });
  const reactivate = () => run("reactivate", () => unwrap(client.POST("/platform/tenants/{id}/reactivate", path)), { success: `${tenant.name} is active again.`, invalidate: refresh });
  const startSupport = async () => {
    const r = await run("support", () => unwrap(client.POST("/platform/tenants/{id}/impersonate", { params: { path: { id }, query: { ttl: 3600 } } })));
    if (!r) return;
    window.open(`${appUrls.shop}/impersonate#token=${encodeURIComponent(r.token)}`, "_blank", "noopener");
    setDialog(null);
  };
  const remove = async () => {
    setDeleteError(null);
    try {
      await run("delete", () => unwrap(client.DELETE("/platform/tenants/{id}", { params: { path: { id }, query: { force: force ? "true" : "false" } } })), { success: "Shop deleted.", invalidate: ["/platform/tenants"], rethrow: true });
      router.replace("/tenants");
    } catch (err) {
      setDeleteError(errorMessage(err));
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        kicker={<Link href="/tenants" className="pl-link">Shops</Link>}
        title={tenant.name}
        description={
          <span className="inline-flex items-center gap-2">
            <Pill tone={TENANT_TONE[tenant.status ?? "trial"]}>{tenant.status}</Pill>
            <span className="pl-mono text-xs">{tenant.customDomain ?? tenant.slug}</span>
          </span>
        }
        actions={
          <>
            {tenant.status !== "closed" ? (
              <Button size="sm" variant="ghost" onClick={() => setDialog("support")}>
                Open shop console <ArrowUpRight size={14} />
              </Button>
            ) : null}
            {tenant.status === "suspended" ? (
              <Button size="sm" loading={isPending("reactivate")} onClick={reactivate}>
                Reactivate
              </Button>
            ) : tenant.status !== "closed" ? (
              <Button size="sm" variant="dark" onClick={() => setDialog("suspend")}>
                Suspend
              </Button>
            ) : null}
          </>
        }
      />

      {tenant.status === "suspended" ? (
        <Notice tone="warn" title="Suspended">
          Since {tenant.suspendedAt ? formatDateTime(tenant.suspendedAt) : "—"}. {tenant.suspendReason ?? "No reason recorded."} Customers can&apos;t order and its kiosks are refused.
        </Notice>
      ) : null}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label="Lifetime sales" value={formatNaira(stats?.gmv ?? 0)} tone="dark" />
        <StatCard label="Print jobs" value={formatNumber(stats?.jobCount ?? 0)} />
        <StatCard label="Customers" value={formatNumber(stats?.customerCount ?? 0)} />
        <StatCard label="Kiosks" value={stats?.kioskCount ?? 0} hint={`${stats?.onlineKiosks ?? 0} online`} />
        <StatCard label="Fee rate" value={`${((tenant.commissionPct ?? 0) * 100).toFixed(1)}%`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Profile">
          <Card>
            <KeyValue
              items={[
                ["Address", tenant.address ?? "—"],
                ["Map pin", tenant.lat != null ? `${tenant.lat.toFixed(4)}, ${tenant.lng?.toFixed(4)}` : "Not set"],
                ["Public listing", tenant.isDiscoverable ? "Listed" : "Hidden"],
                ["Availability", tenant.availability ?? "—"],
                ["Payouts", tenant.paystackSubaccountCode ? "Instant split" : "Scheduled"],
                ["Joined", tenant.createdAt ? formatDateTime(tenant.createdAt) : "—"],
              ]}
            />
          </Card>
        </Section>
        <Section title="Team">
          <DataTable
            rows={members}
            rowKey={(m) => m.userId}
            empty="No members."
            columns={[
              { label: "Person", cell: (m) => <Link href={`/users/${m.userId}`} className="pl-link font-semibold">{m.name || m.email}</Link> },
              { label: "Email", hideOnMobile: true, cell: (m) => <span className="text-xs">{m.email}</span> },
              { label: "Role", cell: (m) => <Pill tone={m.role === "owner" ? "persimmon" : m.role === "admin" ? "ink" : "fog"}>{m.role}</Pill> },
            ]}
          />
        </Section>
      </div>

      <Section title="Danger zone">
        <Card className="border-persimmon flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm max-w-xl">Permanently deletes this shop and everything it owns. A shop must be closed first, have no money owed and be past its cooling-off period, unless you override.</p>
          <Button size="sm" variant="dark" onClick={() => setDialog("delete")}>
            Delete shop…
          </Button>
        </Card>
      </Section>

      <Dialog
        open={dialog === "suspend"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Suspend ${tenant.name}?`}
        description="New orders stop, its kiosks are refused and its storefront shows as unavailable. Existing money isn't touched."
        footer={
          <Button size="sm" variant="dark" loading={isPending("suspend")} onClick={suspend}>
            Suspend shop
          </Button>
        }
      >
        <Textarea label="Reason (shown to the shop owner)" rows={3} maxLength={255} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Dialog>

      <ConfirmDialog
        open={dialog === "support"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Open ${tenant.name}'s console?`}
        description="You'll be signed in as its owner for one hour, in a new tab. Everything you do is written to the audit log."
        confirmLabel="Open console"
        onConfirm={startSupport}
      >
        <p className="text-sm text-ink/70">Support sessions can&apos;t change passwords, two-step sign-in, bank accounts or payouts, and can&apos;t close the shop.</p>
      </ConfirmDialog>

      <Dialog
        open={dialog === "delete"}
        onOpenChange={(o) => {
          if (!o) {
            setDialog(null);
            setTyped("");
            setForce(false);
            setDeleteError(null);
          }
        }}
        title={`Delete ${tenant.name}?`}
        description={`This can't be undone. Type ${tenant.slug} to confirm.`}
        footer={
          <Button size="sm" variant="dark" disabled={typed !== tenant.slug} loading={isPending("delete")} onClick={remove}>
            Delete permanently
          </Button>
        }
      >
        <Input label="Shop handle" value={typed} onChange={(e) => setTyped(e.target.value.trim())} className="pl-mono" autoComplete="off" />
        <label className="flex items-start gap-3 text-sm mt-3 cursor-pointer">
          <input type="checkbox" className="mt-1 h-4 w-4 accent-persimmon" checked={force} onChange={(e) => setForce(e.target.checked)} />
          <span>
            Override safety checks <span className="block text-xs text-fog">Skips the closed, cooling-off and money-owed checks.</span>
          </span>
        </label>
        {deleteError ? (
          <div className="mt-3">
            <Notice tone="danger">{deleteError}</Notice>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
