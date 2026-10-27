"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, Zap } from "lucide-react";
import {
  Button,
  ConfirmDialog,
  DataTable,
  ErrorState,
  Notice,
  PageHeader,
  Pagination,
  Pill,
  Skeleton,
  StatCard,
  Tabs,
  formatDateTime,
  formatNaira,
} from "@printloop/ui";
import { errorMessage, unwrap, type Schemas } from "@printloop/api-client";
import { useApi, useApiClient } from "@printloop/api-client/react";
import { downloadFromApi, useAction } from "@printloop/auth/actions";
import { useCanManage, useShopProfile } from "@/lib/shop-context";

type Tab = "payouts" | "ledger" | "payments";

const PAYOUT_TONE: Record<string, "sage" | "ochre" | "persimmon" | "fog" | "ink"> = {
  paid: "sage",
  pending: "ochre",
  processing: "ink",
  failed: "persimmon",
  cancelled: "fog",
};

function Payouts() {
  const $api = useApi();
  const q = $api.useQuery("get", "/saas/payouts", { params: { query: { limit: 50 } } });
  if (q.error) return <ErrorState message={errorMessage(q.error)} />;
  if (q.isLoading) return <Skeleton className="h-48" />;
  return (
    <DataTable<Schemas["Payout"]>
      rows={q.data?.data?.items ?? []}
      rowKey={(p) => p.id}
      empty="No payouts yet. Paid jobs build your balance, and payouts go out on your schedule."
      columns={[
        { label: "Date", cell: (p) => formatDateTime(p.requestedAt ?? p.createdAt) },
        { label: "Amount", align: "right", cell: (p) => <span className="pl-mono font-bold">{formatNaira(p.amount)}</span> },
        { label: "Fee", align: "right", cell: (p) => <span className="pl-mono">{formatNaira(p.feeAmount)}</span> },
        { label: "Type", cell: (p) => <span className="capitalize">{p.trigger}</span> },
        { label: "Status", cell: (p) => <Pill tone={PAYOUT_TONE[p.status] ?? "fog"}>{p.status}</Pill> },
        { label: "Note", hideOnMobile: true, cell: (p) => <span className="text-xs text-fog">{p.failureReason ?? p.paystackTransferReference ?? ""}</span> },
      ]}
    />
  );
}

function Ledger() {
  const $api = useApi();
  const q = $api.useQuery("get", "/saas/transactions", { params: { query: { limit: 100 } } });
  if (q.error) return <ErrorState message={errorMessage(q.error)} />;
  if (q.isLoading) return <Skeleton className="h-48" />;
  return (
    <DataTable
      rows={q.data?.data?.items ?? []}
      rowKey={(t) => t.id ?? String(t.reference)}
      empty="No transactions yet."
      columns={[
        { label: "Date", cell: (t) => formatDateTime(t.createdAt) },
        { label: "Description", cell: (t) => t.description ?? "—" },
        { label: "Gross", align: "right", cell: (t) => <span className="pl-mono">{formatNaira(t.amount)}</span> },
        { label: "Commission", align: "right", cell: (t) => <span className="pl-mono text-fog">−{formatNaira(t.commissionAmount)}</span> },
        { label: "Type", hideOnMobile: true, cell: (t) => <span className="capitalize text-xs">{t.type}</span> },
      ]}
    />
  );
}

function Payments() {
  const $api = useApi();
  const [page, setPage] = useState(1);
  const q = $api.useQuery("get", "/saas/payments", { params: { query: { page, limit: 25 } } });
  if (q.error) return <ErrorState message={errorMessage(q.error)} />;
  if (q.isLoading) return <Skeleton className="h-48" />;
  const d = q.data?.data;
  return (
    <>
      <DataTable<Schemas["Payment"]>
        rows={d?.payments ?? []}
        rowKey={(p) => p.id}
        empty="No customer payments yet."
        columns={[
          { label: "Date", cell: (p) => formatDateTime(p.createdAt) },
          { label: "Customer", cell: (p) => (p.user ? `${p.user.firstName ?? ""} ${p.user.lastName ?? ""}`.trim() || p.user.email : "Guest") },
          { label: "For", hideOnMobile: true, cell: (p) => <span className="text-xs">{p.description ?? "—"}</span> },
          { label: "Amount", align: "right", cell: (p) => <span className="pl-mono font-bold">{formatNaira(p.amount)}</span> },
          { label: "Status", cell: (p) => <Pill tone={p.refundedAt ? "fog" : "sage"}>{p.refundedAt ? "Refunded" : p.status.toLowerCase()}</Pill> },
          { label: "Reference", hideOnMobile: true, cell: (p) => <span className="pl-mono text-[11px] text-fog">{p.reference}</span> },
        ]}
      />
      <Pagination page={page} pages={d?.totalPages ?? 1} onPage={setPage} />
    </>
  );
}

export function MoneyView() {
  const $api = useApi();
  const client = useApiClient();
  const shop = useShopProfile();
  const manage = useCanManage();
  const { run } = useAction();
  const [tab, setTab] = useState<Tab>("payouts");
  const [confirm, setConfirm] = useState(false);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const balance = $api.useQuery("get", "/saas/balance", {}, { refetchInterval: 60_000 });
  const b = balance.data?.data;
  const hasAccount = shop.onboarding.bankAccountSet || shop.onboarding.subaccountSet;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Business"
        title="Money"
        description={
          shop.onboarding.subaccountSet
            ? "Payments split automatically: your share goes straight to your bank."
            : `Payouts go out ${shop.payoutSchedule?.cadence ?? "weekly"} once your balance passes ${formatNaira(shop.payoutSchedule?.minPayoutAmount ?? 5000)}.`
        }
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs">
              <span className="editorial-label block mb-1">Statement</span>
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="pl-input py-1.5" />
            </label>
            <Button size="sm" variant="ghost" onClick={() => downloadFromApi(`/saas/me/statement?month=${month}`, `statement-${month}.csv`)}>
              <Download size={14} /> CSV
            </Button>
          </div>
        }
      />

      {!hasAccount ? (
        <Notice tone="warn" title="Add a bank account to get paid" action={<Link href="/settings?tab=payouts" className="pl-btn-primary pl-btn-sm">Add account</Link>}>
          Your earnings are safe; they&apos;re paid out once you add an account.
        </Notice>
      ) : null}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {b ? (
          <>
            <StatCard label="Available" value={formatNaira(b.availableBalance)} tone="dark" />
            <StatCard label="Payout in progress" value={formatNaira(b.pendingPayout)} />
            <StatCard label="Commission rate" value={`${Math.round(Number(b.commissionPct) * 1000) / 10}%`} />
            <StatCard label="Commission to date" value={formatNaira(b.lifetimeCommissionPaidToPlatform)} />
          </>
        ) : (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)
        )}
      </div>

      {manage && hasAccount && !shop.onboarding.subaccountSet ? (
        <div className="flex justify-end">
          <Button variant="dark" disabled={!b?.availableBalance} onClick={() => setConfirm(true)}>
            <Zap size={14} /> Pay out now
          </Button>
        </div>
      ) : null}

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: "payouts", label: "Payouts" },
          { value: "ledger", label: "Ledger" },
          { value: "payments", label: "Customer payments" },
        ]}
      />
      {tab === "payouts" ? <Payouts /> : tab === "ledger" ? <Ledger /> : <Payments />}

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Pay out ${formatNaira(b?.availableBalance ?? 0)} now?`}
        description="Instant payouts carry a ₦100 transfer fee and usually land within minutes."
        confirmLabel="Pay out"
        onConfirm={() =>
          run("payout", () => unwrap(client.POST("/saas/payouts/instant")), {
            success: "Payout started. It usually lands within minutes.",
            invalidate: ["/saas/balance", "/saas/payouts"],
            rethrow: true,
          })
        }
      />
    </div>
  );
}
