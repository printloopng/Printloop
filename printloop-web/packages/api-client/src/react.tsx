"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import createQueryHooks from "openapi-react-query";
import { createApiClient, type ApiClient } from "./index";
import { ApiError } from "./errors";
import type { paths } from "./schema";

function makeHooks(client: ApiClient) {
  return createQueryHooks<paths>(client);
}

export type QueryHooks = ReturnType<typeof makeHooks>;

interface ApiContextValue {
  client: ApiClient;
  $api: QueryHooks;
  apiOrigin: string;
  tenantHeaders: Record<string, string>;
}

const ApiContext = createContext<ApiContextValue | null>(null);

function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status > 0 && error.status < 500) return false;
  return failureCount < 2;
}

export function ApiProvider({
  children,
  apiOrigin,
  tenantHeaders = {},
  onUnauthorized,
}: {
  children: ReactNode;
  apiOrigin: string;
  tenantHeaders?: Record<string, string>;
  onUnauthorized?: () => void;
}) {
  const [value] = useState<ApiContextValue & { queryClient: QueryClient }>(() => {
    const client = createApiClient({ baseUrl: "/api/pl", credentials: "same-origin" });
    if (onUnauthorized) {
      client.use({
        onError({ error }) {
          if (error instanceof ApiError && error.status === 401) onUnauthorized();
          return undefined;
        },
      });
    }
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { staleTime: 15_000, retry: shouldRetry, refetchOnWindowFocus: true },
        mutations: { retry: false },
      },
    });
    return { client, $api: makeHooks(client), apiOrigin, tenantHeaders, queryClient };
  });

  return (
    <ApiContext.Provider value={value}>
      <QueryClientProvider client={value.queryClient}>{children}</QueryClientProvider>
    </ApiContext.Provider>
  );
}

export function useApiContext(): ApiContextValue {
  const ctx = useContext(ApiContext);
  if (!ctx) throw new Error("useApi must be used inside <ApiProvider>");
  return ctx;
}

export function useApi(): QueryHooks {
  return useApiContext().$api;
}

export function useApiClient(): ApiClient {
  return useApiContext().client;
}

export { useQueryClient, useQuery, useQueries, useMutation, keepPreviousData } from "@tanstack/react-query";
