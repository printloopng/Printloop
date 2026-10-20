import { ApiError } from "./errors";

export type UploadPurpose = "print-document" | "review-photo" | "edited-document" | "branding-photo";

export interface DirectUploadOptions {
  purpose: UploadPurpose;
  path: string;
  form: FormData;
  apiOrigin: string;
  proxyBase?: string;
  headers?: Record<string, string>;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

async function fetchTicket(proxyBase: string, purpose: UploadPurpose): Promise<string> {
  const res = await fetch(`${proxyBase}/uploads/ticket`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ purpose }),
    credentials: "same-origin",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.data?.ticket) {
    throw new ApiError(res.status, body?.message || "Could not start the upload.", body?.code, body);
  }
  return body.data.ticket as string;
}

export async function uploadDirect<T = unknown>(options: DirectUploadOptions): Promise<T> {
  const ticket = await fetchTicket(options.proxyBase ?? "/api/pl", options.purpose);
  const url = `${options.apiOrigin.replace(/\/+$/, "")}/api${options.path}`;
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("X-Upload-Ticket", ticket);
    for (const [k, v] of Object.entries(options.headers ?? {})) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) options.onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      let body: any = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        options.onProgress?.(1);
        resolve((body && typeof body === "object" && "success" in body ? body.data : body) as T);
      } else {
        reject(new ApiError(xhr.status, body?.message || "Upload failed.", body?.code, body));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, "Network error during upload. Check your connection and retry."));
    xhr.onabort = () => reject(new ApiError(0, "Upload cancelled.", "ABORTED"));
    options.signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(options.form);
  });
}
