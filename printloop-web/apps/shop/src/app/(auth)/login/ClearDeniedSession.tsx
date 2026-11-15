"use client";

import { useEffect } from "react";

export function ClearDeniedSession() {
  useEffect(() => {
    fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => undefined);
  }, []);
  return null;
}
