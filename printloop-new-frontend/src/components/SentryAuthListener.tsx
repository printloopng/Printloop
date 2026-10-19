import { useEffect } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "@/store";
import { setSentryUser } from "@/lib/sentry";

export function SentryAuthListener() {
  const user = useSelector((s: RootState) => s.auth.user);
  useEffect(() => {
    setSentryUser(user || null);
  }, [user?.id, user?.email, user?.role]);
  return null;
}
