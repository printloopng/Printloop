"use client";

import type { ReactNode } from "react";
import { ApiProvider } from "@printloop/api-client/react";
import { Toaster } from "@printloop/ui";

export function Providers({ children, apiOrigin }: { children: ReactNode; apiOrigin: string }) {
  return (
    <ApiProvider
      apiOrigin={apiOrigin}
      onUnauthorized={() => {
        if (!window.location.pathname.startsWith("/login")) {
          window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
        }
      }}
    >
      {children}
      <Toaster />
    </ApiProvider>
  );
}
