"use client";

import { useEffect, useState } from "react";
import { keepPreviousData, useApi } from "@printloop/api-client/react";
import type { PrintConfig } from "./PrintOptions";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useQuote(pageCount: number, config: PrintConfig, promotionCode: string, enabled: boolean) {
  const $api = useApi();
  const body = useDebounced(
    {
      pageCount: Math.max(1, pageCount),
      printConfiguration: {
        copies: config.copies,
        paper: config.paper,
        color: config.color,
        sided: config.sided,
        qualityDpi: config.qualityDpi,
        orientation: config.orientation,
        pages: config.pages,
        pageRange: config.pages === "range" ? config.pageRange : undefined,
      },
      promotionCode: promotionCode.trim() || undefined,
    },
    250,
  );
  const q = $api.useQuery(
    "post",
    "/customer/print-jobs/quote",
    { body },
    { enabled: enabled && pageCount > 0, placeholderData: keepPreviousData, staleTime: 30_000 },
  );
  return { quote: q.data?.data ?? null, isFetching: q.isFetching, error: q.error };
}
