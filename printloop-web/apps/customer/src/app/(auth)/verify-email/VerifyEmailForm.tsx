"use client";

import { useEffect, useState } from "react";
import { Button, Input, Notice, toast } from "@printloop/ui";

async function post(path: string, body: unknown) {
  const res = await fetch(`/api/pl${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) throw new Error(payload?.message || "Request failed");
  return payload?.data;
}

export function VerifyEmailForm({
  email: initialEmail,
  signedIn,
  alreadyVerified,
  next,
}: {
  email: string;
  signedIn: boolean;
  alreadyVerified: boolean;
  next: string;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (alreadyVerified) {
    return (
      <div className="space-y-4">
        <Notice tone="success">Your email is already verified.</Notice>
        <a href={next} className="pl-btn-primary">
          Continue <span className="pl-arrow">→</span>
        </a>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await post("/customer/auth/verify-email", { email, code });
      window.location.assign(signedIn ? next : `/login?registered=1&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
    } catch (err) {
      setError((err as Error).message || "That code didn't work.");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (!email) return setError("Enter your email first.");
    try {
      await post("/customer/auth/resend-verification", { email });
      toast.success("A new code is on its way.");
      setCooldown(60);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="mt-4">
      {error ? (
        <div className="mb-3">
          <Notice tone="danger">{error}</Notice>
        </div>
      ) : null}
      {signedIn ? (
        <p className="text-sm text-ink/70 mb-4">
          Code sent to <strong>{email}</strong>
        </p>
      ) : (
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      )}
      <Input
        label="Verification code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        className="pl-mono text-2xl tracking-[0.5em] text-center"
        autoFocus
      />
      <div className="flex items-center justify-between pt-2">
        <button type="button" onClick={resend} disabled={cooldown > 0} className="text-sm pl-link disabled:opacity-50">
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
        </button>
        <Button type="submit" loading={busy} arrow>
          Verify
        </Button>
      </div>
    </form>
  );
}
