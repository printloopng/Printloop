"use client";

import { useState, useSyncExternalStore } from "react";
import { CheckCircle2, Clock } from "lucide-react";
import { Button, Card, Input, Notice, QrBlock, StatusPill, formatDateTime, formatNaira, toast } from "@printloop/ui";
import { ApiError, errorMessage } from "@printloop/api-client";
import { useApiContext, useQuery, useQueryClient } from "@printloop/api-client/react";
import { Dropzone } from "@/components/print/Dropzone";

interface SessionInfo {
  groupName: string;
  deadline: string;
  defaultOptions: Record<string, unknown>;
}

interface Status {
  participant: { name: string; status: string };
  printJob: { id: string; code: string | null; cost: number; status: string; totalPages: number } | null;
}

const storageKey = (shareId: string) => `pl_group_${shareId}`;

function readToken(shareId: string): string | null {
  try {
    return sessionStorage.getItem(storageKey(shareId));
  } catch {
    return null;
  }
}

function subscribe() {
  return () => undefined;
}

async function call<T>(apiOrigin: string, path: string, token: string | null, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (token) headers.set("X-Upload-Token", token);
  const res = await fetch(`${apiOrigin}/api${path}`, { ...init, headers });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body?.message || "Request failed", body?.code, body);
  return body?.data as T;
}

function uploadWithToken(apiOrigin: string, token: string, form: FormData, onProgress: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${apiOrigin}/api/participant-upload/upload`);
    xhr.setRequestHeader("X-Upload-Token", token);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let message = "Upload failed.";
      try {
        message = JSON.parse(xhr.responseText).message || message;
      } catch {
        message = "Upload failed.";
      }
      reject(new ApiError(xhr.status, message));
    };
    xhr.onerror = () => reject(new ApiError(0, "Network error during upload."));
    xhr.send(form);
  });
}

export function JoinFlow({
  shareId,
  session,
  prefill,
}: {
  shareId: string;
  session: SessionInfo;
  prefill: { name: string; email: string } | null;
}) {
  const { apiOrigin } = useApiContext();
  const stored = useSyncExternalStore(subscribe, () => readToken(shareId), () => null);
  const [token, setToken] = useState<string | null>(null);
  const activeToken = token ?? stored;
  const [name, setName] = useState(prefill?.name ?? "");
  const [email, setEmail] = useState(prefill?.email ?? "");
  const [phone, setPhone] = useState("");
  const [copies, setCopies] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const qc = useQueryClient();
  const statusQuery = useQuery({
    queryKey: ["participant-status", activeToken],
    enabled: Boolean(activeToken),
    refetchInterval: (q) => ((q.state.data as Status | undefined)?.participant.status === "PAID" ? false : 4000),
    queryFn: async () => {
      try {
        return await call<Status>(apiOrigin, "/participant-upload/status", activeToken);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          sessionStorage.removeItem(storageKey(shareId));
          setToken(null);
        }
        throw err;
      }
    },
  });
  const status = statusQuery.data ?? null;
  const refresh = () => qc.invalidateQueries({ queryKey: ["participant-status", activeToken] });

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return toast.error("Enter your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return toast.error("Enter your email. Your receipt goes there.");
    setBusy(true);
    try {
      const data = await call<{ uploadToken: string }>(apiOrigin, `/groups/${encodeURIComponent(shareId)}/join`, null, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), phoneNumber: phone.trim() || undefined }),
      });
      sessionStorage.setItem(storageKey(shareId), data.uploadToken);
      setToken(data.uploadToken);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const upload = async () => {
    if (!file || !activeToken) return;
    const form = new FormData();
    form.append("file", file, file.name);
    form.append("fileName", file.name);
    form.append("printConfiguration", JSON.stringify({ copies }));
    setProgress(0);
    try {
      await uploadWithToken(apiOrigin, activeToken, form, setProgress);
      await refresh();
      toast.success("Uploaded. Pay to add it to the batch.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setProgress(null);
    }
  };

  const pay = async () => {
    if (!activeToken) return;
    setBusy(true);
    try {
      const data = await call<{ authorizationUrl: string; mock?: boolean }>(apiOrigin, "/participant-upload/pay", activeToken, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim() || undefined, callbackUrl: `${window.location.origin}/join/${shareId}` }),
      });
      if (data.mock) {
        toast.error("Online payment isn't switched on for this server yet.");
        return;
      }
      window.location.assign(data.authorizationUrl);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const options = session.defaultOptions as { paper?: string; color?: string; sided?: string; enforce?: boolean };
  const job = status?.printJob;
  const paid = status?.participant.status === "PAID";

  return (
    <div className="space-y-6">
      <header className="border-b-2 border-ink pb-5">
        <div className="editorial-label text-persimmon">Group print</div>
        <h1 className="mt-2 font-serif text-4xl font-extrabold tracking-tight">{session.groupName}</h1>
        <p className="mt-2 flex items-center gap-2 text-sm text-ink/70">
          <Clock size={14} /> Upload by {formatDateTime(session.deadline)}
        </p>
        {options.enforce ? (
          <p className="mt-1 text-xs text-fog">
            Printed {options.paper ?? "A4"} · {options.color === "color" ? "colour" : "black & white"} ·{" "}
            {options.sided === "double" ? "double-sided" : "single-sided"} for everyone.
          </p>
        ) : null}
      </header>

      {!activeToken ? (
        <Card>
          <h2 className="font-serif text-2xl font-bold mb-1">Join the group</h2>
          <p className="text-sm text-ink/60 mb-5">No account needed. You pay only for your own pages.</p>
          <form onSubmit={join} noValidate>
            <Input label="Your name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} />
            <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" helper="We send your receipt here." />
            <Input label="Phone (optional)" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
            <div className="flex justify-end mt-2">
              <Button type="submit" loading={busy} arrow>
                Join
              </Button>
            </div>
          </form>
        </Card>
      ) : paid && job ? (
        <div className="border-2 border-ink">
          <div className="bg-ink text-paper p-6 text-center">
            <CheckCircle2 className="mx-auto text-sage" size={36} />
            <h2 className="mt-2 font-serif text-2xl font-bold">You&apos;re in the batch</h2>
            <p className="text-sm text-paper/70 mt-1">The organiser collects every paid document with one code.</p>
          </div>
          <div className="p-6 flex flex-col sm:flex-row items-center gap-6">
            {job.code ? <QrBlock value={`printloop://release/${job.code}`} caption={job.code} label="Your receipt" size={130} /> : null}
            <dl className="text-sm space-y-1">
              <div>
                <dt className="editorial-label inline">Pages </dt>
                <dd className="inline font-bold">{job.totalPages}</dd>
              </div>
              <div>
                <dt className="editorial-label inline">Paid </dt>
                <dd className="inline font-bold">{formatNaira(job.cost)}</dd>
              </div>
            </dl>
          </div>
        </div>
      ) : job ? (
        <Card>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-serif text-2xl font-bold">Pay for your document</h2>
            <StatusPill status={job.status} />
          </div>
          <p className="text-sm text-ink/60 mt-1">
            {job.totalPages} page{job.totalPages === 1 ? "" : "s"} uploaded. It joins the batch once paid.
          </p>
          <div className="mt-5 flex items-center justify-between border-2 border-ink bg-ink text-paper p-4">
            <span className="font-serif italic">Total</span>
            <span className="pl-mono text-3xl font-bold">{formatNaira(job.cost)}</span>
          </div>
          <Button className="w-full mt-4" loading={busy} onClick={pay} arrow>
            Pay with Paystack
          </Button>
        </Card>
      ) : (
        <Card>
          <h2 className="font-serif text-2xl font-bold mb-4">Upload your document</h2>
          <Dropzone accept=".pdf,application/pdf,.png,.jpg,.jpeg" onFiles={(f) => setFile(f[0] ?? null)} files={file ? [file] : []} hint="PDF or a photo · up to 50 MB" />
          <label className="mt-4 flex items-center gap-3 text-sm">
            <span className="editorial-label">Copies</span>
            <input type="number" min={1} max={20} value={copies} onChange={(e) => setCopies(Math.min(20, Math.max(1, Number(e.target.value) || 1)))} className="pl-input w-24" />
          </label>
          {progress !== null ? (
            <div className="mt-4 h-2 bg-ink/10">
              <div className="h-full bg-persimmon transition-all" style={{ width: `${progress * 100}%` }} />
            </div>
          ) : null}
          <Button className="w-full mt-5" disabled={!file} loading={progress !== null} onClick={upload} arrow>
            Upload
          </Button>
          <Notice tone="info">You&apos;ll see the exact price before paying.</Notice>
        </Card>
      )}
    </div>
  );
}
