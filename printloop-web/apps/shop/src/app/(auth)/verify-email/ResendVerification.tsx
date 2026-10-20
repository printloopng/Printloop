"use client";

import { useState } from "react";
import { Button, Input, toast } from "@printloop/ui";

export function ResendVerification({ defaultEmail }: { defaultEmail: string }) {
  const [email, setEmail] = useState(defaultEmail);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast.error("Enter your email.");
    setBusy(true);
    await fetch("/api/pl/saas/resend-verification", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    setBusy(false);
    toast.success("If that email has a shop waiting, a new link is on its way.");
  };
  return (
    <div>
      <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <Button onClick={send} loading={busy}>
        Send a new link
      </Button>
    </div>
  );
}
