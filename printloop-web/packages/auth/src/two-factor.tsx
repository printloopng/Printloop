"use client";

import { useState } from "react";
import { Button, Input, Notice, QrBlock, Skeleton, toast } from "@printloop/ui";
import { errorMessage, unwrap } from "@printloop/api-client";
import { useApiClient } from "@printloop/api-client/react";
import { useRefreshSession, useSession } from "./client";

type Step = "setup" | "enable" | "disable";

export function TwoFactorPanel() {
  const session = useSession();
  const refresh = useRefreshSession();
  const client = useApiClient();
  const [enrol, setEnrol] = useState<{ otpauthUrl: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<Step | null>(null);
  const enabled = Boolean(session.data?.totpEnabled);
  const validCode = /^\d{6}$/.test(code);

  const attempt = async <T,>(step: Step, fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
    setBusy(step);
    try {
      const result = await fn();
      if (success) toast.success(success);
      return result;
    } catch (err) {
      toast.error(errorMessage(err));
      return undefined;
    } finally {
      setBusy(null);
    }
  };

  const start = async () => {
    const r = await attempt("setup", () => unwrap(client.POST("/saas/me/2fa/setup")));
    if (r) setEnrol(r);
  };
  const confirm = async () => {
    const r = await attempt("enable", () => unwrap(client.POST("/saas/me/2fa/enable", { body: { code } })), "Two-step sign-in is on.");
    if (!r) return;
    setEnrol(null);
    setCode("");
    await refresh();
  };
  const disable = async () => {
    const r = await attempt("disable", () => unwrap(client.POST("/saas/me/2fa/disable", { body: { code } })), "Two-step sign-in is off.");
    if (!r) return;
    setCode("");
    await refresh();
  };

  if (session.isLoading) return <Skeleton className="h-48 max-w-xl" />;

  return (
    <div className="max-w-xl space-y-4">
      {enabled ? (
        <>
          <Notice tone="success" title="On">
            Your account asks for a code from your authenticator app at every sign-in.
          </Notice>
          <Input label="Current code to turn it off" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className="pl-mono tracking-widest" />
          <Button size="sm" variant="ghost" disabled={!validCode} loading={busy === "disable"} onClick={disable}>
            Turn off
          </Button>
        </>
      ) : enrol ? (
        <>
          <ol className="list-decimal pl-5 space-y-1 text-sm">
            <li>Open your authenticator app (Google Authenticator, Authy, 1Password) and scan this code.</li>
            <li>Type the 6-digit number it shows.</li>
          </ol>
          <QrBlock value={enrol.otpauthUrl} caption="Scan with your authenticator" fileName="printloop-2fa" />
          <p className="text-xs text-fog">
            Can&apos;t scan? Enter this key: <code className="pl-mono break-all">{enrol.secret}</code>
          </p>
          <Input label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className="pl-mono tracking-widest" />
          <Button size="sm" disabled={!validCode} loading={busy === "enable"} onClick={confirm}>
            Confirm and turn on
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-ink/70">A password alone isn&apos;t enough for an account that can move money. Add a code from your phone.</p>
          <Button size="sm" loading={busy === "setup"} onClick={start}>
            Set up two-step sign-in
          </Button>
        </>
      )}
    </div>
  );
}
