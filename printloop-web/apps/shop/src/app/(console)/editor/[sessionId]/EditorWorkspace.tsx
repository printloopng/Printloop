"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Radio, Save, Send } from "lucide-react";
import { Button, ConfirmDialog, EmptyState, InlineLoader, Notice, Pill, Skeleton, cx, timeAgo } from "@printloop/ui";
import { errorMessage, unwrap } from "@printloop/api-client";
import { useApi, useApiClient } from "@printloop/api-client/react";
import { useAction } from "@printloop/auth/actions";
import type { SaveState } from "./UniverCanvas";

const UniverCanvas = dynamic(() => import("./UniverCanvas"), {
  ssr: false,
  loading: () => <Skeleton className="h-[70vh] w-full" />,
});

export function EditorWorkspace({ sessionId, jobId }: { sessionId: string; jobId: string | null }) {
  const $api = useApi();
  const client = useApiClient();
  const router = useRouter();
  const { run, isPending } = useAction();
  const [save, setSave] = useState<SaveState>({ status: "idle", at: null, version: 0 });
  const [customerHere, setCustomerHere] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const q = $api.useQuery(
    "get",
    "/saas/editor/session/{id}",
    { params: { path: { id: sessionId } } },
    {
      refetchInterval: (query) => {
        const s = query.state.data?.data?.conversionStatus;
        return s === "pending" || s === "processing" ? 1500 : false;
      },
      refetchOnWindowFocus: false,
    },
  );
  const view = q.data?.data;

  if (q.isLoading) return <InlineLoader label="Opening the editor…" />;
  if (!view) return <EmptyState title="Editor session not found" description={q.error ? errorMessage(q.error) : undefined} action={<Link href="/edits" className="pl-btn-primary">Edit queue</Link>} />;

  const back = jobId ? `/edits/${jobId}` : "/edits";
  const converting = view.conversionStatus === "pending" || view.conversionStatus === "processing";

  const send = async () => {
    const result = await run("export", () => unwrap(client.POST("/saas/editor/session/{id}/export", { params: { path: { id: sessionId } } })), {
      success: "Sent to the customer for review.",
      invalidate: ["/saas/edit-queue", "/saas/edit/{jobId}"],
      rethrow: true,
    });
    if (result) router.push(back);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Link href={back} className="inline-flex items-center gap-1.5 editorial-label text-ink/50 hover:text-persimmon">
            <ArrowLeft size={13} /> Back
          </Link>
          <h1 className="font-serif text-2xl font-bold truncate">Editing · {view.printJob?.code ?? "document"}</h1>
          <Pill tone={customerHere ? "sage" : "fog"} live={customerHere}>
            <Radio size={11} /> {customerHere ? "Customer watching" : "Customer away"}
          </Pill>
        </div>
        <div className="flex items-center gap-3">
          <span className={cx("text-xs", save.status === "error" ? "text-persimmon font-bold" : "text-fog")}>
            {save.status === "saving" ? "Saving…" : save.status === "error" ? save.message : save.at ? `Saved ${timeAgo(save.at)} · v${save.version}` : "No changes yet"}
          </span>
          {!view.readOnly ? (
            <Button size="sm" variant="dark" disabled={converting || save.status === "saving"} loading={isPending("export")} onClick={() => setConfirmSend(true)}>
              <Send size={14} /> Send to customer
            </Button>
          ) : null}
        </div>
      </div>

      {view.printJob?.editingInstructions ? (
        <Notice tone="info" title="Customer's request">
          {view.printJob.editingInstructions}
        </Notice>
      ) : null}
      {view.readOnly ? <Notice tone="warn">This session is {view.status}. It opens read-only.</Notice> : null}
      {view.conversionStatus === "failed" ? (
        <Notice tone="danger" title="We couldn't read the original">
          {view.conversionError ?? "Try uploading a corrected PDF from the edit page instead."}
        </Notice>
      ) : null}

      {converting ? (
        <div className="border-2 border-ink bg-paper-light h-[60vh] grid place-items-center">
          <InlineLoader label="Converting the document into editable text…" />
        </div>
      ) : view.document ? (
        <UniverCanvas
          sessionId={sessionId}
          document={view.document}
          initialVersion={view.version}
          token={view.token}
          socketPath={view.socketPath}
          readOnly={view.readOnly}
          onSaveState={setSave}
          onPeer={setCustomerHere}
        />
      ) : null}

      <p className="flex items-center gap-1.5 text-xs text-fog">
        <Save size={12} /> Changes save automatically and stream to the customer as you type.
      </p>

      <ConfirmDialog
        open={confirmSend}
        onOpenChange={setConfirmSend}
        title="Send this version for approval?"
        description="We'll turn it into a PDF. The customer approves and pays, or sends it back with notes."
        confirmLabel="Send"
        onConfirm={send}
      />
    </div>
  );
}
