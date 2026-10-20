"use client";

import { useEffect, useRef, useState } from "react";
import { InlineLoader, Notice } from "@printloop/ui";
import { errorMessage } from "@printloop/api-client";
import { adoptToken } from "@printloop/auth/client";

export function AdoptSession() {
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    window.history.replaceState(null, "", window.location.pathname);
    if (!token) {
      queueMicrotask(() => setError("This support link is missing its token. Start again from the backoffice."));
      return;
    }
    adoptToken(token)
      .then(() => window.location.replace("/"))
      .catch((err) => setError(errorMessage(err, "This support link has expired.")));
  }, []);
  return error ? <Notice tone="danger" title="Couldn't open the shop">{error}</Notice> : <InlineLoader label="Starting support session…" />;
}
