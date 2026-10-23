"use client";

import { toast } from "@printloop/ui";

export async function downloadFromApi(path: string, fallbackName: string, method: "GET" | "POST" = "GET") {
  try {
    const res = await fetch(`/api/pl${path}`, { method });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.message || "Download failed.");
    }
    const disposition = res.headers.get("content-disposition") ?? "";
    const match = /filename="?([^";]+)"?/i.exec(disposition);
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = match?.[1] ?? fallbackName;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    toast.error((err as Error).message);
  }
}
