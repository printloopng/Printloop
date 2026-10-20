"use client";

import { useState } from "react";
import { errorMessage } from "@printloop/api-client";
import { useQueryClient } from "@printloop/api-client/react";
import { toast } from "@printloop/ui";

export function useAction() {
  const qc = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);
  const run = async <T,>(
    key: string,
    fn: () => Promise<T>,
    opts: { success?: string; invalidate?: string[]; rethrow?: boolean } = {},
  ): Promise<T | undefined> => {
    setPending(key);
    try {
      const result = await fn();
      if (opts.success) toast.success(opts.success);
      await Promise.all((opts.invalidate ?? []).map((path) => qc.invalidateQueries({ queryKey: ["get", path] })));
      return result;
    } catch (err) {
      toast.error(errorMessage(err));
      if (opts.rethrow) throw err;
      return undefined;
    } finally {
      setPending(null);
    }
  };
  return { run, pending, isPending: (key: string) => pending === key };
}

export function downloadCsv(filename: string, rows: Array<Array<string | number | null | undefined>>) {
  const csv = rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
