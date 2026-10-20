"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, FileUp, PenLine, Send } from "lucide-react";
import {
  Button,
  Card,
  EmptyState,
  InlineLoader,
  KeyValue,
  Notice,
  PageHeader,
  Pill,
  Section,
  Textarea,
  formatDateTime,
  formatNaira,
} from "@printloop/ui";
import { errorMessage, unwrap, uploadDirect } from "@printloop/api-client";
import { useApi, useApiClient, useApiContext } from "@printloop/api-client/react";
import { useAction } from "@/lib/actions";
import { EDIT_STATUS } from "../EditsView";

export function EditDetail({ jobId }: { jobId: string }) {
  const $api = useApi();
  const client = useApiClient();
  const router = useRouter();
  const { apiOrigin } = useApiContext();
  const { run, isPending } = useAction();
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const q = $api.useQuery("get", "/saas/edit/{jobId}", { params: { path: { jobId } } }, { refetchInterval: 15_000 });
  const edit = q.data?.data;
  const path = { params: { path: { jobId } } };
  const invalidate = ["/saas/edit/{jobId}", "/saas/edit-queue"];

  if (q.isLoading) return <InlineLoader />;
  if (!edit) return <EmptyState title="Edit request not found" description={q.error ? errorMessage(q.error) : undefined} action={<Link href="/edits" className="pl-btn-primary">Edit queue</Link>} />;

  const job = edit.printJob;
  const canStart = edit.status === "pending_shop" || edit.status === "rejected";
  const editing = edit.status === "in_progress";

  const openEditor = async () => {
    const data = await run("editor", async () => {
      if (canStart) await unwrap(client.POST("/saas/edit/{jobId}/start", path));
      return unwrap(client.POST("/saas/editor/session", { body: { editId: edit.id } }));
    });
    if (data?.sessionId) router.push(`/editor/${data.sessionId}?job=${jobId}`);
  };

  const uploadEdited = async () => {
    if (!file) return;
    setProgress(0);
    try {
      await run(
        "upload",
        async () => {
          if (canStart) await unwrap(client.POST("/saas/edit/{jobId}/start", path));
          const form = new FormData();
          form.append("file", file, file.name);
          const stored = await uploadDirect<{ fileURL: string }>({ purpose: "edited-document", path: "/uploads/edited-document", form, apiOrigin, onProgress: setProgress });
          return unwrap(client.POST("/saas/edit/{jobId}/upload", { ...path, body: { documentUrl: stored.fileURL, shopNotes: notes.trim() || null } }));
        },
        { success: "Sent to the customer for review.", invalidate },
      );
      setFile(null);
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="space-y-6">
      <Link href="/edits" className="inline-flex items-center gap-1.5 editorial-label text-ink/50 hover:text-persimmon">
        <ArrowLeft size={13} /> Edit queue
      </Link>
      <PageHeader
        kicker={`Code ${job?.code ?? "—"}`}
        title={job?.fileName ?? "Document"}
        description={`Requested ${formatDateTime(edit.createdAt)}`}
        actions={<Pill tone={EDIT_STATUS[edit.status]?.tone}>{EDIT_STATUS[edit.status]?.label ?? edit.status}</Pill>}
      />

      {edit.customerRejectionReason && (edit.status === "rejected" || editing) ? (
        <Notice tone="warn" title="The customer asked for changes">
          {edit.customerRejectionReason}
        </Notice>
      ) : null}
      {edit.status === "pending_customer" ? (
        <Notice tone="info" title="Waiting for the customer">
          They&apos;ll approve and pay, or send it back with notes.
        </Notice>
      ) : null}

      <div className="grid lg:grid-cols-[1.3fr_1fr] gap-6 items-start">
        <div className="space-y-6">
          <Section title="What the customer wants">
            <Card>
              <p className="font-serif text-lg whitespace-pre-wrap">{job?.editingInstructions || "No instructions given."}</p>
              {job?.documentUrl ? (
                <a href={job.documentUrl} target="_blank" rel="noreferrer" className="pl-btn-ghost pl-btn-sm mt-4">
                  <Download size={14} /> Download original
                </a>
              ) : null}
            </Card>
          </Section>

          {canStart || editing ? (
            <Section title="Make the edit" description="Pick whichever is faster for this document.">
              <div className="grid sm:grid-cols-2 gap-4">
                <Card className="flex flex-col gap-3">
                  <PenLine className="text-persimmon" />
                  <h3 className="font-serif text-xl font-bold">Edit in the browser</h3>
                  <p className="text-sm text-ink/70 flex-1">We convert the document to editable text. The customer can watch changes live.</p>
                  <Button loading={isPending("editor")} onClick={openEditor} arrow>
                    Open editor
                  </Button>
                </Card>
                <Card className="flex flex-col gap-3">
                  <FileUp className="text-persimmon" />
                  <h3 className="font-serif text-xl font-bold">Upload a corrected PDF</h3>
                  <p className="text-sm text-ink/70">Edit offline in Word, export to PDF, upload it here.</p>
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    aria-label="Edited PDF"
                    className="text-sm"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                  <Textarea label="Note to the customer (optional)" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} wrapperClassName="mb-0" />
                  {progress !== null ? (
                    <div className="h-2 bg-ink/10">
                      <div className="h-full bg-persimmon" style={{ width: `${progress * 100}%` }} />
                    </div>
                  ) : null}
                  <Button variant="dark" disabled={!file} loading={isPending("upload")} onClick={uploadEdited}>
                    <Send size={14} /> Send for review
                  </Button>
                </Card>
              </div>
            </Section>
          ) : null}
        </div>

        <Card>
          <h2 className="font-serif text-xl font-bold mb-4">Details</h2>
          <KeyValue
            items={[
              ["Original pages", String(job?.pageCount ?? "—")],
              ["Paper", `${job?.paperSize ?? "A4"} · ${job?.colorMode === "color" ? "Colour" : "B&W"}`],
              ["Edited pages", String(edit.editedDocumentMeta?.pageCount ?? "—")],
              ["Editing fee", formatNaira(edit.totalEditFee)],
              ["Approved", formatDateTime(edit.approvedAt)],
            ]}
          />
          {job?.editedDocumentUrl ? (
            <a href={job.editedDocumentUrl} target="_blank" rel="noreferrer" className="pl-btn-ghost pl-btn-sm mt-5">
              <Download size={14} /> Latest edited PDF
            </a>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
