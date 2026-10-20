"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Radio } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  Button,
  Card,
  Dialog,
  EmptyState,
  InlineLoader,
  KeyValue,
  Notice,
  Pill,
  Textarea,
  formatNaira,
  toast,
} from "@printloop/ui";
import { errorMessage, unwrap } from "@printloop/api-client";
import { useApi, useApiClient, useApiContext, useQuery, useQueryClient } from "@printloop/api-client/react";
import { useCheckout, useInvalidateJobs } from "@/lib/queries";
import { PagePreview } from "@/components/print/PagePreview";
import { UniverText } from "@/components/edit/UniverText";

function useLiveDocument(apiOrigin: string, token: string | null, initial: unknown) {
  const [doc, setDoc] = useState<unknown>(initial);
  const [shopOnline, setShopOnline] = useState(false);
  useEffect(() => {
    if (!token) return;
    let socket: { disconnect: () => void } | null = null;
    let cancelled = false;
    import("socket.io-client").then(({ io }) => {
      if (cancelled) return;
      const s = io(apiOrigin, { path: "/editor-socket", transports: ["websocket"], auth: { token } });
      s.on("room-state", (state: { peerConnected?: boolean }) => setShopOnline(Boolean(state.peerConnected)));
      s.on("peer-joined", () => setShopOnline(true));
      s.on("peer-left", () => setShopOnline(false));
      s.on("snapshot", (payload: { snapshot: unknown }) => setDoc(payload.snapshot));
      socket = s;
    });
    return () => {
      cancelled = true;
      socket?.disconnect();
    };
  }, [apiOrigin, token]);
  return { doc, shopOnline };
}

function EditedPdf({ url }: { url: string }) {
  const pdf = useQuery({
    queryKey: ["edited-pdf", url],
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error("unavailable");
      const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
      GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const doc: PDFDocumentProxy = await getDocument({ data: new Uint8Array(await res.arrayBuffer()), isEvalSupported: false }).promise;
      return doc;
    },
  });
  return (
    <div className="space-y-3">
      <a href={url} target="_blank" rel="noreferrer" className="pl-btn-ghost pl-btn-sm">
        <ExternalLink size={13} /> Open the edited PDF
      </a>
      {pdf.data ? (
        <PagePreview doc={pdf.data} pages={Array.from({ length: pdf.data.numPages }, (_, i) => i + 1)} grayscale={false} landscape={false} />
      ) : pdf.isLoading ? (
        <InlineLoader label="Loading preview…" />
      ) : (
        <p className="text-xs text-fog">Inline preview isn&apos;t available for this file. Open it to check every page.</p>
      )}
    </div>
  );
}

export function EditReview({ jobId }: { jobId: string }) {
  const $api = useApi();
  const client = useApiClient();
  const qc = useQueryClient();
  const { apiOrigin } = useApiContext();
  const checkout = useCheckout();
  const invalidateJobs = useInvalidateJobs();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const view = $api.useQuery("get", "/saas/editor/by-job/{jobId}", { params: { path: { jobId } } }, { refetchInterval: 8_000 });
  const detail = $api.useQuery("get", "/saas/edit/{jobId}", { params: { path: { jobId } } });
  const data = view.data?.data as
    | {
        status: string;
        editedDocumentUrl: string | null;
        totalEditFee: number;
        session: { token: string | null; document: unknown; printJob?: { editingInstructions?: string | null } | null } | null;
      }
    | undefined;
  const live = useLiveDocument(apiOrigin, data?.status === "in_progress" ? data.session?.token ?? null : null, data?.session?.document ?? null);

  if (view.isLoading) return <InlineLoader />;
  if (!data) {
    return (
      <EmptyState
        title="No edit for this job"
        description={view.error ? errorMessage(view.error) : "This job didn't ask for editing."}
        action={<Link href={`/jobs/${jobId}`} className="pl-btn-primary">Back to job</Link>}
      />
    );
  }

  const fee = Number(detail.data?.data?.totalEditFee ?? data.totalEditFee ?? 0);
  const pending = data.status === "pending_customer";
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["get", "/saas/editor/by-job/{jobId}"] }), invalidateJobs()]);

  const approve = async () => {
    setBusy(true);
    try {
      await unwrap(client.POST("/saas/edit/{jobId}/confirm", { params: { path: { jobId } } }));
      await refresh();
      toast.success("Approved. Pay to get your print code.");
      await checkout(jobId);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (reason.trim().length < 5) return toast.error("Tell the shop what to change.");
    setBusy(true);
    try {
      await unwrap(client.POST("/saas/edit/{jobId}/reject", { params: { path: { jobId } }, body: { reason: reason.trim() } }));
      setRejecting(false);
      setReason("");
      await refresh();
      toast.success("Sent back to the shop with your notes.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const statusLabel: Record<string, string> = {
    pending_shop: "Waiting for the shop",
    in_progress: "Shop is editing",
    pending_customer: "Ready for your review",
    rejected: "Changes requested",
    approved: "Approved",
  };

  return (
    <div className="space-y-6">
      <Link href={`/jobs/${jobId}`} className="inline-flex items-center gap-1.5 editorial-label text-ink/50 hover:text-persimmon">
        <ArrowLeft size={13} /> Job
      </Link>
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b-2 border-ink pb-5">
        <div>
          <Pill tone={pending ? "persimmon" : "ochre"} live={data.status === "in_progress"}>
            {statusLabel[data.status] ?? data.status}
          </Pill>
          <h1 className="mt-3 font-serif text-3xl sm:text-4xl font-extrabold tracking-tight">Review your edited document</h1>
        </div>
        {pending ? (
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setRejecting(true)}>
              Ask for changes
            </Button>
            <Button loading={busy} onClick={approve} arrow>
              Approve &amp; pay
            </Button>
          </div>
        ) : null}
      </header>

      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-6 items-start">
        <div className="space-y-4">
          {data.status === "in_progress" ? (
            <Notice tone="info" title="Watching live">
              <span className="inline-flex items-center gap-2">
                <Radio size={14} className={live.shopOnline ? "text-sage" : "text-fog"} />
                {live.shopOnline ? "The shop is editing right now. Changes appear as they save." : "The shop isn't in the editor at the moment."}
              </span>
            </Notice>
          ) : null}
          {pending && data.editedDocumentUrl ? <EditedPdf url={data.editedDocumentUrl} /> : null}
          {live.doc ? <UniverText document={live.doc} /> : !pending ? <Card>The shop hasn&apos;t started editing yet.</Card> : null}
        </div>
        <Card>
          <h2 className="font-serif text-xl font-bold mb-4">Summary</h2>
          <KeyValue
            items={[
              ["Your request", String(data.session?.printJob?.editingInstructions || detail.data?.data?.printJob?.editingInstructions || "—")],
              ["Editing fee", formatNaira(fee)],
              ["Pages after edit", String((detail.data?.data?.editedDocumentMeta as { pageCount?: number } | null)?.pageCount ?? "—")],
            ]}
          />
          <p className="text-xs text-fog mt-4">You pay the editing fee and the print together after approving. Nothing is charged before that.</p>
        </Card>
      </div>

      <Dialog
        open={rejecting}
        onOpenChange={setRejecting}
        title="What should change?"
        description="Be specific. The shop sees exactly what you write."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
            <Button size="sm" loading={busy} onClick={reject}>
              Send back
            </Button>
          </>
        }
      >
        <Textarea label="Changes" rows={4} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Dialog>
    </div>
  );
}
