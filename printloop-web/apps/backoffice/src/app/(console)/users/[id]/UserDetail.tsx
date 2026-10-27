"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Card, ConfirmDialog, DataTable, Dialog, ErrorState, KeyValue, Notice, PageHeader, Pill, Section, Select, Skeleton, StatCard, Textarea, formatDateTime, formatNaira, timeAgo } from "@printloop/ui";
import { errorMessage, unwrap } from "@printloop/api-client";
import { useApi, useApiClient } from "@printloop/api-client/react";
import { useSession } from "@printloop/auth/client";
import { useAction } from "@printloop/auth/actions";
import { ROLE_LABEL } from "../UsersView";

type Role = keyof typeof ROLE_LABEL;

export function UserDetail({ id }: { id: string }) {
  const $api = useApi();
  const client = useApiClient();
  const me = useSession().data;
  const { run, isPending } = useAction();
  const [dialog, setDialog] = useState<"block" | "role" | null>(null);
  const [reason, setReason] = useState("");
  const [role, setRole] = useState<Role>("user");
  const q = $api.useQuery("get", "/platform/users/{id}", { params: { path: { id } } });
  const d = q.data?.data;
  const user = d?.user;
  const path = { params: { path: { id } } };
  const refresh = ["/platform/users/{id}", "/platform/users"];

  if (q.error) return <ErrorState message={errorMessage(q.error)} />;
  if (q.isLoading || !user) return <Skeleton className="h-96" />;

  const self = me?.id === user.id;
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;

  const block = (isBlocked: boolean) =>
    run("block", () => unwrap(client.PATCH("/platform/users/{id}/block", { ...path, body: { isBlocked, reason: isBlocked ? reason.trim() || undefined : undefined } })), {
      success: isBlocked ? `${name} is blocked.` : `${name} is unblocked.`,
      invalidate: refresh,
    }).then((r) => {
      if (r) {
        setDialog(null);
        setReason("");
      }
    });
  const changeRole = async () => {
    const r = await run("role", () => unwrap(client.PATCH("/platform/users/{id}/role", { ...path, body: { role } })), { success: `${name} is now ${ROLE_LABEL[role]}.`, invalidate: refresh });
    if (r) setDialog(null);
  };

  return (
    <div className="space-y-8">
      <PageHeader
        kicker={<Link href="/users" className="pl-link">People</Link>}
        title={name}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {user.email}
            <Pill tone="ink">{ROLE_LABEL[user.role]}</Pill>
            {user.isBlocked ? <Pill tone="persimmon">Blocked</Pill> : null}
          </span>
        }
        actions={
          self ? null : (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setRole(user.role);
                  setDialog("role");
                }}
              >
                Change role
              </Button>
              {user.isBlocked ? (
                <Button size="sm" loading={isPending("block")} onClick={() => block(false)}>
                  Unblock
                </Button>
              ) : (
                <Button size="sm" variant="dark" onClick={() => setDialog("block")}>
                  Block
                </Button>
              )}
            </>
          )
        }
      />

      {user.isBlocked ? (
        <Notice tone="danger" title="Blocked">
          {user.blockReason ?? "No reason recorded."}
        </Notice>
      ) : null}

      <div className="grid grid-cols-2 gap-3 max-w-xl">
        <StatCard label="Print jobs" value={d?.stats?.totalJobs ?? 0} />
        <StatCard label="Total spent" value={formatNaira(d?.stats?.totalSpent ?? 0)} tone="dark" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Account">
          <Card>
            <KeyValue
              items={[
                ["Phone", user.phoneNumber ?? "—"],
                ["Email verified", user.isEmailVerified ? "Yes" : "No"],
                ["Two-step sign-in", user.totpEnabled ? "On" : "Off"],
                ["Last sign-in", user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "Never"],
                ["Joined", user.createdAt ? formatDateTime(user.createdAt) : "—"],
              ]}
            />
          </Card>
        </Section>
        <Section title="Shop access">
          <DataTable
            rows={d?.memberships ?? []}
            rowKey={(m) => String(m.tenantId)}
            empty="Not on any shop's team."
            columns={[
              { label: "Shop", cell: (m) => <Link href={`/tenants/${m.tenantId}`} className="pl-link font-semibold">{m.tenantName}</Link> },
              { label: "Role", cell: (m) => <Pill tone={m.role === "owner" ? "persimmon" : "ink"}>{m.role}</Pill> },
            ]}
          />
        </Section>
      </div>

      <Section title="Recent print jobs">
        <DataTable
          rows={(d?.recentJobs ?? []) as Array<Record<string, any>>}
          rowKey={(j) => String(j.id)}
          empty="No jobs yet."
          columns={[
            { label: "When", cell: (j) => (j.createdAt ? timeAgo(j.createdAt) : "—") },
            { label: "File", cell: (j) => <span className="line-clamp-1 max-w-xs">{j.fileName ?? "—"}</span> },
            { label: "Status", cell: (j) => <Pill tone="ink">{String(j.status ?? "")}</Pill> },
            { label: "Cost", align: "right", cell: (j) => <span className="pl-mono">{formatNaira(Number(j.cost ?? 0))}</span> },
          ]}
        />
      </Section>

      <Dialog
        open={dialog === "block"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Block ${name}?`}
        description="They can't sign in or use PrintLoop until unblocked. Jobs already paid for aren't refunded automatically."
        footer={
          <Button size="sm" variant="dark" loading={isPending("block")} onClick={() => block(true)}>
            Block account
          </Button>
        }
      >
        <Textarea label="Reason (recorded in the audit log)" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Dialog>

      <ConfirmDialog
        open={dialog === "role"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Change ${name}'s role`}
        description="Platform roles control what someone can do outside any single shop. Shop team roles are managed by each shop."
        confirmLabel="Change role"
        destructive={role === "super_admin"}
        onConfirm={changeRole}
      >
        <Select
          label="Role"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          options={(Object.keys(ROLE_LABEL) as Role[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
          helper={role === "super_admin" ? "Staff can suspend shops, impersonate and see all data." : undefined}
        />
      </ConfirmDialog>
    </div>
  );
}
