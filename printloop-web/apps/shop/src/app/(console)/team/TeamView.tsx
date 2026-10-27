"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button, ConfirmDialog, DataTable, Dialog, ErrorState, Input, Notice, PageHeader, Pill, Select, Skeleton, formatDate } from "@printloop/ui";
import { errorMessage, unwrap, type Schemas } from "@printloop/api-client";
import { useApi, useApiClient } from "@printloop/api-client/react";
import { useSession } from "@printloop/auth/client";
import { useAction } from "@/lib/actions";
import { useCanManage, useIsOwner } from "@/lib/shop-context";

type Member = Schemas["TeamMember"];

const ROLE_COPY: Record<Member["role"], string> = {
  owner: "Everything, including payouts and closing the shop.",
  admin: "Prices, kiosks, team (staff only) and payouts.",
  staff: "Run the queue, release jobs and do edits.",
};

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const client = useApiClient();
  const owner = useIsOwner();
  const { run, isPending } = useAction();
  const [email, setEmail] = useState("");
  const [firstName, setFirst] = useState("");
  const [lastName, setLast] = useState("");
  const [role, setRole] = useState<"admin" | "staff">("staff");
  const valid = /^\S+@\S+\.\S+$/.test(email.trim());
  const submit = () =>
    run(
      "invite",
      () =>
        unwrap(
          client.POST("/saas/team", {
            body: { email: email.trim().toLowerCase(), role, firstName: firstName.trim() || undefined, lastName: lastName.trim() || undefined },
          }),
        ),
      { invalidate: ["/saas/team"] },
    ).then((r) => {
      if (!r) return;
      onOpenChange(false);
      setEmail("");
      setFirst("");
      setLast("");
    });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add a team member"
      description="New people get an email to set their password. Existing PrintLoop users are added straight away."
      footer={
        <Button size="sm" disabled={!valid} loading={isPending("invite")} onClick={submit}>
          Add to team
        </Button>
      }
    >
      <Input label="Email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
      <div className="grid grid-cols-2 gap-3">
        <Input label="First name" value={firstName} onChange={(e) => setFirst(e.target.value)} />
        <Input label="Last name" value={lastName} onChange={(e) => setLast(e.target.value)} />
      </div>
      <Select
        label="Role"
        value={role}
        onChange={(e) => setRole(e.target.value as "admin" | "staff")}
        options={[
          { value: "staff", label: "Staff" },
          ...(owner ? [{ value: "admin", label: "Admin" }] : []),
        ]}
        helper={ROLE_COPY[role]}
      />
    </Dialog>
  );
}

export function TeamView() {
  const $api = useApi();
  const client = useApiClient();
  const manage = useCanManage();
  const owner = useIsOwner();
  const me = useSession().data;
  const { run } = useAction();
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);
  const q = $api.useQuery("get", "/saas/team");
  const members = q.data?.data?.members ?? [];
  const name = (m: Member) => [m.firstName, m.lastName].filter(Boolean).join(" ") || m.email || "Member";
  const canRemove = (m: Member) => manage && m.role !== "owner" && m.userId !== me?.id && (owner || m.role === "staff");

  return (
    <div>
      <PageHeader
        kicker="Setup"
        title="Team"
        description="Who can work in this console."
        actions={
          manage ? (
            <Button size="sm" onClick={() => setInviting(true)}>
              <UserPlus size={14} /> Add member
            </Button>
          ) : null
        }
      />
      {!manage ? <Notice tone="info">Only owners and admins can change the team.</Notice> : null}
      {q.error ? (
        <ErrorState message={errorMessage(q.error)} />
      ) : q.isLoading ? (
        <Skeleton className="h-48" />
      ) : (
        <div className="mt-4">
          <DataTable<Member>
            rows={members}
            rowKey={(m) => m.userId}
            empty="Only you so far."
            columns={[
              {
                label: "Person",
                cell: (m) => (
                  <div>
                    <div className="font-semibold">
                      {name(m)} {m.userId === me?.id ? <span className="text-fog font-normal">(you)</span> : null}
                    </div>
                    <div className="text-xs text-fog">{m.email}</div>
                  </div>
                ),
              },
              {
                label: "Role",
                cell: (m) =>
                  owner && m.role !== "owner" ? (
                    <select
                      aria-label={`Role for ${name(m)}`}
                      className="pl-input py-1 w-28"
                      value={m.role}
                      onChange={(e) =>
                        void run(
                          "role",
                          () => unwrap(client.PATCH("/saas/team/{userId}", { params: { path: { userId: m.userId } }, body: { role: e.target.value as "admin" | "staff" } })),
                          { success: `${name(m)} is now ${e.target.value}.`, invalidate: ["/saas/team"] },
                        )
                      }
                    >
                      <option value="admin">Admin</option>
                      <option value="staff">Staff</option>
                    </select>
                  ) : (
                    <Pill tone={m.role === "owner" ? "persimmon" : m.role === "admin" ? "ink" : "fog"}>{m.role}</Pill>
                  ),
              },
              { label: "Joined", hideOnMobile: true, cell: (m) => (m.joinedAt ? formatDate(m.joinedAt) : "—") },
              { label: "", hideOnMobile: true, cell: (m) => (m.isBlocked ? <Pill tone="persimmon">Blocked</Pill> : null) },
              {
                label: "",
                align: "right",
                cell: (m) =>
                  canRemove(m) ? (
                    <button type="button" className="text-xs pl-link" onClick={() => setRemoving(m)}>
                      Remove
                    </button>
                  ) : null,
              },
            ]}
          />
          <dl className="mt-8 grid gap-3 sm:grid-cols-3">
            {(Object.keys(ROLE_COPY) as Member["role"][]).map((r) => (
              <div key={r} className="border-2 border-ink/20 p-4">
                <dt className="editorial-label">{r}</dt>
                <dd className="text-sm mt-1 text-ink/75">{ROLE_COPY[r]}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      <InviteDialog open={inviting} onOpenChange={setInviting} />
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing ? name(removing) : ""}?`}
        description="They lose access to this console straight away. Their past actions stay in the audit log."
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          if (!removing) return;
          await run("remove", () => unwrap(client.DELETE("/saas/team/{userId}", { params: { path: { userId: removing.userId } } })), {
            success: "Removed from the team.",
            invalidate: ["/saas/team"],
            rethrow: true,
          });
          setRemoving(null);
        }}
      />
    </div>
  );
}
