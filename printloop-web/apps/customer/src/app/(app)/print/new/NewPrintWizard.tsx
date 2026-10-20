"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileEdit, ShieldCheck, Tag } from "lucide-react";
import {
  Button,
  Card,
  Checkbox,
  Input,
  InlineLoader,
  KeyValue,
  Notice,
  Textarea,
  cx,
  formatNaira,
  toast,
} from "@printloop/ui";
import { errorMessage, uploadDirect } from "@printloop/api-client";
import { useApiContext } from "@printloop/api-client/react";
import { useShop } from "@/lib/shop-context";
import { useCheckout, useInvalidateJobs, usePriceList } from "@/lib/queries";
import { acceptFor, kindOf, openPdf, parsePageRange, type DocKind, type PdfInfo } from "@/lib/pdf";
import { Dropzone } from "@/components/print/Dropzone";
import { DEFAULT_CONFIG, PrintOptions, type PrintConfig } from "@/components/print/PrintOptions";
import { PagePreview } from "@/components/print/PagePreview";
import { useQuote } from "@/components/print/useQuote";
import { ShopRequired } from "@/components/ShopRequired";

type Step = 1 | 2 | 3;
const STEPS = ["Document", "Options", "Review & pay"];

function Stepper({ step }: { step: Step }) {
  return (
    <ol className="grid grid-cols-3 gap-2 mb-8" aria-label="Progress">
      {STEPS.map((label, i) => {
        const n = (i + 1) as Step;
        return (
          <li
            key={label}
            aria-current={n === step ? "step" : undefined}
            className={cx(
              "border-2 p-3",
              n === step ? "border-ink bg-persimmon text-paper" : n < step ? "border-ink bg-ink text-paper" : "border-ink/25 text-ink/50",
            )}
          >
            <span className="font-serif italic text-sm opacity-80">0{n}</span>
            <span className="block text-[11px] font-bold tracking-editorial uppercase mt-0.5">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function NewPrintWizard() {
  const shop = useShop();
  const router = useRouter();
  const { apiOrigin, tenantHeaders } = useApiContext();
  const prices = usePriceList();
  const checkout = useCheckout();
  const invalidate = useInvalidateJobs();

  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<DocKind | null>(null);
  const [pdf, setPdf] = useState<PdfInfo | null>(null);
  const [reading, setReading] = useState(false);
  const [estimate, setEstimate] = useState(1);
  const [rawConfig, setConfig] = useState<PrintConfig>(DEFAULT_CONFIG);
  const [promo, setPromo] = useState("");
  const [editing, setEditing] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [progress, setProgress] = useState<number | null>(null);

  const list = prices.data?.data;
  const configs = useMemo(() => list?.configs ?? [], [list]);
  const papers = useMemo(() => {
    const set = Array.from(new Set(configs.map((c) => String(c.paperSize).toUpperCase())));
    return set.length ? set : ["A4"];
  }, [configs]);
  const colourAvailable = configs.some((c) => c.colorType === "COLOR");
  const officeEnabled = Boolean(list?.officeConversion);
  const editingOffer = list?.editing;

  const config = useMemo<PrintConfig>(
    () => ({
      ...rawConfig,
      paper: papers.includes(rawConfig.paper.toUpperCase()) ? rawConfig.paper.toUpperCase() : papers[0]!,
      color: colourAvailable ? rawConfig.color : "bw",
    }),
    [rawConfig, papers, colourAvailable],
  );

  const docPages = kind === "pdf" ? pdf?.pageCount ?? 0 : kind === "image" ? 1 : estimate;
  const selected = useMemo(() => {
    if (kind !== "pdf" || !pdf) return [];
    if (config.pages !== "range") return Array.from({ length: pdf.pageCount }, (_, i) => i + 1);
    return parsePageRange(config.pageRange, pdf.pageCount);
  }, [kind, pdf, config.pages, config.pageRange]);
  const rangeError =
    config.pages === "range" && kind === "pdf" && config.pageRange.trim() && selected.length === 0
      ? "That range doesn't match any pages."
      : config.pages === "range" && !config.pageRange.trim()
        ? "Enter the pages you want."
        : null;

  const { quote, isFetching, error: quoteError } = useQuote(docPages, config, promo, step >= 2 && Boolean(file) && !rangeError);
  const editFee = editing && editingOffer?.enabled ? editingOffer.baseFee + editingOffer.perPageFee * docPages : 0;

  const pickFile = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    const k = kindOf(f);
    if (k === "unsupported") return toast.error("PrintLoop prints PDFs, images and Office documents.");
    if (k === "office" && !officeEnabled) return toast.error("This shop can't convert Word or PowerPoint yet. Export to PDF and upload that.");
    if (f.size > 50 * 1024 * 1024) return toast.error("That file is over 50 MB.");
    pdf?.doc.destroy();
    setFile(f);
    setKind(k);
    setPdf(null);
    setConfig((c) => ({ ...c, pages: "all", pageRange: "" }));
    if (k === "pdf") {
      setReading(true);
      try {
        const info = await openPdf(f);
        setPdf(info);
        setConfig((c) => ({ ...c, orientation: info.orientation }));
      } catch {
        toast.error("We couldn't read that PDF. It may be password-protected or damaged.");
        setFile(null);
        setKind(null);
      } finally {
        setReading(false);
      }
    }
  };

  useEffect(() => () => void pdf?.doc.destroy(), [pdf]);

  const submit = async () => {
    if (!file) return;
    const form = new FormData();
    form.append("file", file, file.name);
    form.append(
      "printConfiguration",
      JSON.stringify({ ...config, pageRange: config.pages === "range" ? config.pageRange : undefined }),
    );
    if (promo.trim()) form.append("promotionCode", promo.trim());
    if (editing) {
      form.append("editingRequired", "true");
      if (instructions.trim()) form.append("editingInstructions", instructions.trim());
    }
    setProgress(0);
    try {
      const data = await uploadDirect<{ job: { id: string; status: string } }>({
        purpose: "print-document",
        path: "/customer/print-jobs",
        form,
        apiOrigin,
        headers: tenantHeaders,
        onProgress: setProgress,
      });
      await invalidate();
      if (editing) {
        toast.success("Sent to the shop for editing. We'll let you know when it's ready to review.");
        router.push(`/jobs/${data.job.id}`);
        return;
      }
      await checkout(data.job.id);
      router.push(`/jobs/${data.job.id}`);
    } catch (err) {
      toast.error(errorMessage(err, "Upload failed. Check your connection and try again."));
    } finally {
      setProgress(null);
    }
  };

  if (!shop) return <ShopRequired />;
  if (prices.isLoading) return <InlineLoader label="Loading prices…" />;

  return (
    <div>
      <Stepper step={step} />

      {step === 1 ? (
        <Card className="space-y-6">
          <Dropzone
            accept={acceptFor(officeEnabled)}
            onFiles={pickFile}
            files={file ? [file] : []}
            hint={officeEnabled ? "PDF, Word, PowerPoint, Excel or a photo · up to 50 MB" : "PDF or a photo (PNG, JPG) · up to 50 MB"}
          />
          {reading ? <InlineLoader label="Reading your document…" /> : null}
          {kind === "pdf" && pdf ? (
            <p className="text-sm">
              <strong>{pdf.pageCount}</strong> page{pdf.pageCount === 1 ? "" : "s"} detected.
            </p>
          ) : null}
          {kind === "office" ? (
            <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
              <Notice tone="warn">
                Office files are converted to PDF when you upload. Your exact page count and price are confirmed after
                conversion.
              </Notice>
              <Input
                label="Approx. pages"
                type="number"
                min={1}
                value={estimate}
                onChange={(e) => setEstimate(Math.max(1, Number(e.target.value) || 1))}
                wrapperClassName="mb-0 w-32"
              />
            </div>
          ) : null}

          {editingOffer?.enabled ? (
            <div className="border-2 border-ink/20 bg-paper-warm p-4">
              <div className="flex gap-3">
                <FileEdit className="shrink-0 text-persimmon mt-0.5" size={20} />
                <div className="flex-1">
                  <Checkbox
                    checked={editing}
                    onChange={(e) => setEditing(e.target.checked)}
                    label="Ask the shop to edit it first"
                    description={`Fix formatting, typos or layout before printing. From ${formatNaira(editingOffer.baseFee)} + ${formatNaira(editingOffer.perPageFee)}/page. You approve the result before paying.`}
                  />
                  {editing ? (
                    <Textarea
                      label="What should change?"
                      wrapperClassName="mt-3"
                      rows={3}
                      maxLength={2000}
                      placeholder="e.g. Fix the title page, add page numbers, use 1.5 line spacing"
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value)}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          <div className="flex justify-end">
            <Button arrow disabled={!file || reading} onClick={() => setStep(2)}>
              Continue
            </Button>
          </div>
        </Card>
      ) : null}

      {step >= 2 && file ? (
        <div className="grid lg:grid-cols-[1.35fr_1fr] gap-6 items-start">
          <div className="space-y-6">
            {step === 2 ? (
              <Card>
                <h2 className="font-serif text-2xl font-bold mb-5">Print options</h2>
                <PrintOptions
                  config={config}
                  onChange={setConfig}
                  papers={papers}
                  colourAvailable={colourAvailable}
                  rangeable={kind === "pdf" && Boolean(pdf)}
                  totalPages={docPages}
                  rangeError={rangeError}
                />
              </Card>
            ) : (
              <Card>
                <h2 className="font-serif text-2xl font-bold mb-4">Check before you pay</h2>
                <KeyValue
                  items={[
                    ["Document", <span key="d" className="break-all">{file.name}</span>],
                    ["Pages", config.pages === "range" ? `${config.pageRange} (${selected.length})` : `All ${docPages}`],
                    ["Copies", String(config.copies)],
                    ["Paper", `${config.paper} · ${config.orientation}`],
                    ["Colour", config.color === "color" ? "Colour" : "Black & white"],
                    ["Sides", config.sided === "double" ? "Double-sided" : "Single-sided"],
                    ["Quality", `${config.qualityDpi} dpi`],
                    ["Shop", shop.name],
                  ]}
                />
                {editing ? (
                  <Notice tone="info" title="Editing requested">
                    The shop edits your document first. You review and approve it, then pay the print and editing fees
                    together.
                  </Notice>
                ) : null}
              </Card>
            )}
            {kind === "pdf" && pdf ? (
              <Card>
                <div className="flex items-baseline justify-between mb-3">
                  <h3 className="font-serif text-lg font-bold">Preview</h3>
                  <span className="text-xs text-fog">{config.color === "bw" ? "Shown in black & white" : "Shown in colour"}</span>
                </div>
                <PagePreview doc={pdf.doc} pages={selected} grayscale={config.color === "bw"} landscape={config.orientation === "landscape"} />
              </Card>
            ) : null}
          </div>

          <aside className="lg:sticky lg:top-24 space-y-4">
            <div className="border-2 border-ink bg-ink text-paper p-5">
              <div className="editorial-label text-persimmon">Total</div>
              <div className={cx("mt-1 pl-mono text-4xl font-bold tabular-nums", isFetching && "opacity-60")}>
                {quote ? formatNaira(Number(quote.cost) + editFee) : "—"}
                {kind === "office" ? <span className="text-base align-top ml-1">est.</span> : null}
              </div>
              {quote ? (
                <dl className="mt-4 space-y-1.5 text-sm text-paper/80">
                  <div className="flex justify-between">
                    <dt>Printing · {quote.pageCount} page{quote.pageCount === 1 ? "" : "s"} × {config.copies}</dt>
                    <dd className="pl-mono">{formatNaira(quote.baseCost)}</dd>
                  </div>
                  {quote.discount ? (
                    <div className="flex justify-between text-sage">
                      <dt>Promo {quote.promoCode}</dt>
                      <dd className="pl-mono">−{formatNaira(quote.discount)}</dd>
                    </div>
                  ) : null}
                  {editFee ? (
                    <div className="flex justify-between">
                      <dt>Editing (estimate)</dt>
                      <dd className="pl-mono">{formatNaira(editFee)}</dd>
                    </div>
                  ) : null}
                </dl>
              ) : quoteError ? (
                <p className="mt-3 text-sm text-persimmon">{errorMessage(quoteError)}</p>
              ) : null}
            </div>

            <div className="border-2 border-ink p-4 bg-paper-light">
              <label htmlFor="promo" className="editorial-label flex items-center gap-1.5 mb-2">
                <Tag size={12} /> Promo code
              </label>
              <input
                id="promo"
                value={promo}
                onChange={(e) => setPromo(e.target.value.toUpperCase())}
                className="pl-input pl-mono uppercase"
                placeholder="Optional"
                maxLength={32}
              />
              {promo && quote && quote.promoReason && quote.promoReason !== "no_code" ? (
                <p className="text-xs text-persimmon font-semibold mt-1">
                  {quote.promoReason === "not_found" ? "That code isn't valid at this shop." : `That code is ${quote.promoReason.replace("_", " ")}.`}
                </p>
              ) : null}
            </div>

            {progress !== null ? (
              <div className="border-2 border-ink p-4">
                <div className="flex justify-between text-sm font-bold mb-2">
                  <span>Uploading</span>
                  <span className="pl-mono">{Math.round(progress * 100)}%</span>
                </div>
                <div className="h-2 bg-ink/10">
                  <div className="h-full bg-persimmon transition-all" style={{ width: `${progress * 100}%` }} />
                </div>
              </div>
            ) : null}

            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setStep(step === 3 ? 2 : 1)} disabled={progress !== null}>
                Back
              </Button>
              {step === 2 ? (
                <Button className="flex-1" arrow disabled={Boolean(rangeError) || !quote} onClick={() => setStep(3)}>
                  Review
                </Button>
              ) : (
                <Button className="flex-1" arrow loading={progress !== null} disabled={!quote} onClick={submit}>
                  {editing ? "Send for editing" : `Pay ${quote ? formatNaira(quote.cost) : ""}`}
                </Button>
              )}
            </div>
            <p className="flex items-center gap-2 text-xs text-fog">
              <ShieldCheck size={14} /> Card, transfer or USSD through Paystack. PrintLoop never sees your card.
            </p>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
