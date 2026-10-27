"use client";

import { useState } from "react";
import { Button, Card, Input, KeyValue, Notice, Section, Select } from "@printloop/ui";
import { unwrap } from "@printloop/api-client";
import { useApiClient } from "@printloop/api-client/react";
import { NIGERIAN_BANKS, bankName } from "@/lib/banks";
import { useAction } from "@/lib/actions";
import { useCanManage, useShopProfile } from "@/lib/shop-context";

const BANK_OPTIONS = [{ value: "", label: "Choose your bank" }, ...NIGERIAN_BANKS.map((b) => ({ value: b.code, label: b.name }))];

export function PayoutsTab() {
  const shop = useShopProfile();
  const client = useApiClient();
  const manage = useCanManage();
  const { run, isPending } = useAction();
  const current = shop.payoutSchedule;
  const [bankCode, setBank] = useState(current?.bankCode ?? "");
  const [accountNumber, setNumber] = useState(current?.accountNumber ?? "");
  const [accountName, setName] = useState(current?.accountName ?? "");
  const validNumber = /^\d{10}$/.test(accountNumber);
  const ready = Boolean(bankCode) && validNumber;

  const saveAccount = () =>
    run("bank", () => unwrap(client.POST("/saas/setup/bank-account", { body: { bankCode, accountNumber, accountName: accountName.trim() } })), {
      success: "Payout account saved.",
      invalidate: ["/saas/me"],
    });
  const enableSplit = () =>
    run("split", () => unwrap(client.POST("/saas/setup/paystack-subaccount", { body: { bankCode, accountNumber } })), {
      success: "Instant split settlement is on.",
      invalidate: ["/saas/me"],
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        <Section title="Payout bank account" description="Where we send your earnings. Use a Nigerian NUBAN account in your business or your name.">
          <Card className="space-y-1">
            <Select label="Bank" value={bankCode} disabled={!manage} onChange={(e) => setBank(e.target.value)} options={BANK_OPTIONS} />
            <div className="grid sm:grid-cols-2 gap-x-4">
              <Input
                label="Account number"
                inputMode="numeric"
                maxLength={10}
                disabled={!manage}
                value={accountNumber}
                onChange={(e) => setNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
                error={accountNumber && !validNumber ? "10 digits" : undefined}
                className="pl-mono"
              />
              <Input label="Account name" disabled={!manage} value={accountName} onChange={(e) => setName(e.target.value)} helper="Exactly as the bank shows it" />
            </div>
            {manage ? (
              <div className="pt-2">
                <Button size="sm" disabled={!ready || accountName.trim().length < 3} loading={isPending("bank")} onClick={saveAccount}>
                  Save account
                </Button>
              </div>
            ) : (
              <Notice tone="info">Only owners and admins can change where money goes.</Notice>
            )}
          </Card>
        </Section>
        <Section title="Instant split settlement" description="Optional. Paystack pays your share straight to this account on every order, minus the PrintLoop fee.">
          <Card className="space-y-3">
            {shop.onboarding.subaccountSet ? (
              <Notice tone="success">Split settlement is on. Paystack settles your share automatically.</Notice>
            ) : (
              <p className="text-sm text-ink/70">Turn this on to skip weekly payouts. It uses the bank and account number above.</p>
            )}
            {manage ? (
              <Button size="sm" variant="ghost" disabled={!ready} loading={isPending("split")} onClick={enableSplit}>
                {shop.onboarding.subaccountSet ? "Update split account" : "Turn on split settlement"}
              </Button>
            ) : null}
          </Card>
        </Section>
      </div>
      <Card className="h-fit">
        <div className="editorial-label mb-3">On file</div>
        {current?.accountNumber ? (
          <KeyValue
            items={[
              ["Bank", bankName(current.bankCode)],
              ["Account", <span key="n" className="pl-mono">{current.accountNumber}</span>],
              ["Name", current.accountName ?? "—"],
              ["Schedule", current.cadence === "weekly" ? "Weekly" : current.cadence],
              ["Minimum", `₦${Number(current.minPayoutAmount ?? 0).toLocaleString("en-NG")}`],
            ]}
          />
        ) : (
          <p className="text-sm text-fog">No payout account yet. You can still take orders; earnings wait until you add one.</p>
        )}
      </Card>
    </div>
  );
}
