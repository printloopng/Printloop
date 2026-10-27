"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable, ErrorState, PageHeader, Pagination, Pill, Skeleton, Tabs, formatDate, timeAgo } from "@printloop/ui";
import { errorMessage, type Schemas } from "@printloop/api-client";
import { useApi } from "@printloop/api-client/react";

type User = Schemas["PublicUser"];
type RoleFilter = "all" | "user" | "admin" | "super_admin";

export const ROLE_LABEL = { user: "Customer", admin: "Shop admin", super_admin: "PrintLoop staff" } as const;

export function UsersView() {
  const $api = useApi();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [role, setRole] = useState<RoleFilter>("all");
  const [term, setTerm] = useState("");
  const [search, setSearch] = useState("");
  const q = $api.useQuery("get", "/platform/users", { params: { query: { page, limit: 25, search: search || undefined, role: role === "all" ? undefined : role } } });
  const d = q.data?.data;

  return (
    <div>
      <PageHeader kicker="Network" title="People" description="Customers, shop staff and PrintLoop staff across every shop." />
      <Tabs
        value={role}
        onChange={(r) => {
          setRole(r);
          setPage(1);
        }}
        items={[
          { value: "all", label: "Everyone" },
          { value: "user", label: "Customers" },
          { value: "admin", label: "Shop admins" },
          { value: "super_admin", label: "Staff" },
        ]}
      />
      <form
        className="mb-5 flex gap-2 max-w-md"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(term.trim());
          setPage(1);
        }}
      >
        <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search name, email or phone" aria-label="Search people" className="pl-input" />
        <button type="submit" className="pl-btn-dark pl-btn-sm">
          Search
        </button>
      </form>
      {q.error ? (
        <ErrorState message={errorMessage(q.error)} />
      ) : q.isLoading ? (
        <Skeleton className="h-72" />
      ) : (
        <>
          <DataTable<User>
            rows={d?.users ?? []}
            rowKey={(u) => u.id}
            onRowClick={(u) => router.push(`/users/${u.id}`)}
            empty="No one matches."
            columns={[
              {
                label: "Person",
                cell: (u) => (
                  <div>
                    <div className="font-semibold">{[u.firstName, u.lastName].filter(Boolean).join(" ") || "—"}</div>
                    <div className="text-xs text-fog">{u.email}</div>
                  </div>
                ),
              },
              { label: "Role", cell: (u) => ROLE_LABEL[u.role] },
              {
                label: "Status",
                cell: (u) => (
                  <span className="flex gap-1.5 flex-wrap">
                    {u.isBlocked ? <Pill tone="persimmon">Blocked</Pill> : null}
                    {!u.isEmailVerified ? <Pill tone="ochre">Unverified</Pill> : null}
                    {u.totpEnabled ? <Pill tone="sage">2FA</Pill> : null}
                  </span>
                ),
              },
              { label: "Last seen", hideOnMobile: true, cell: (u) => (u.lastLoginAt ? timeAgo(u.lastLoginAt) : "Never") },
              { label: "Joined", hideOnMobile: true, cell: (u) => (u.createdAt ? formatDate(u.createdAt) : "—") },
            ]}
          />
          <Pagination page={page} pages={d?.totalPages ?? 1} onPage={setPage} />
        </>
      )}
    </div>
  );
}
