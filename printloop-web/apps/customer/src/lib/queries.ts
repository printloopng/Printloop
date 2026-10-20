"use client";

import { useApi, useApiClient, useQueryClient } from "@printloop/api-client/react";
import { errorMessage, unwrap } from "@printloop/api-client";
import { toast } from "@printloop/ui";
import { LIVE_STATUSES, type Job } from "./jobs";

export function useJobs() {
  const $api = useApi();
  return $api.useQuery(
    "get",
    "/customer/print-jobs",
    {},
    {
      refetchInterval: (query) => {
        const jobs = (query.state.data?.data?.jobs ?? []) as Job[];
        return jobs.some((j) => LIVE_STATUSES.has(j.status)) ? 3_000 : 20_000;
      },
    },
  );
}

export function useJobList(): { jobs: Job[]; isLoading: boolean; error: unknown; refetch: () => void } {
  const q = useJobs();
  return { jobs: (q.data?.data?.jobs ?? []) as Job[], isLoading: q.isLoading, error: q.error, refetch: () => void q.refetch() };
}

export function usePriceList() {
  const $api = useApi();
  return $api.useQuery("get", "/customer/pricing", {}, { staleTime: 60_000 });
}

export function useInvalidateJobs() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["get", "/customer/print-jobs"] });
}

export function useCheckout() {
  const client = useApiClient();
  return async (jobId: string) => {
    try {
      const data = await unwrap(
        client.POST("/payments/initialize-job-payment", {
          body: { jobId, callbackUrl: `${window.location.origin}/jobs/${jobId}?paid=1` },
        }),
      );
      const result = data as { authorizationUrl?: string; mock?: boolean } | undefined;
      if (!result?.authorizationUrl || result.mock) {
        toast.error("Online payment isn't switched on for this server yet. Ask the shop to collect payment.");
        return;
      }
      window.location.assign(result.authorizationUrl);
    } catch (err) {
      toast.error(errorMessage(err, "Could not start checkout."));
    }
  };
}
