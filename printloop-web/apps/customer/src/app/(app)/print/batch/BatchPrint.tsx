"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, GripVertical, Trash2 } from "lucide-react";
import { Button, Card, Checkbox, InlineLoader, Notice, cx, formatNaira, toast } from "@printloop/ui";
import { errorMessage, unwrap, uploadDirect } from "@printloop/api-client";
import { useApiClient, useApiContext, useQueries } from "@printloop/api-client/react";
import { useShop } from "@/lib/shop-context";
import { useCheckout, useInvalidateJobs, usePriceList } from "@/lib/queries";
import { acceptFor, kindOf, openPdf, type DocKind } from "@/lib/pdf";
import { Dropzone } from "@/components/print/Dropzone";
import { DEFAULT_CONFIG, PrintOptions, type PrintConfig } from "@/components/print/PrintOptions";
import { ShopRequired } from "@/components/ShopRequired";

interface Item {
  id: string;
  file: File;
  kind: DocKind;
  pages: number;
  config: PrintConfig;
}

const MAX_FILES = 20;

export function BatchPrint() {
  const shop = useShop();
  const router = useRouter();
  const client = useApiClient();
  const { apiOrigin, tenantHeaders } = useApiContext();
  const prices = usePriceList();
  const checkout = useCheckout();
  const invalidate = useInvalidateJobs();
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [collate, setCollate] = useState(true);
  const [promo, setPromo] = useState("");
  const [adding, setAdding] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  const list = prices.data?.data;
  const configs = useMemo(() => list?.configs ?? [], [list]);
  const papers = useMemo(() => {
    const p = Array.from(new Set(configs.map((c) => String(c.paperSize).toUpperCase())));
    return p.length ? p : ["A4"];
  }, [configs]);
  const colourAvailable = configs.some((c) => c.colorType === "COLOR");
  const officeEnabled = Boolean(list?.officeConversion);

  const quotes = useQueries({
    queries: items.map((it) => ({
      queryKey: ["batch-quote", it.pages, it.config],
      staleTime: 30_000,
      queryFn: () =>
        unwrap(
          client.POST("/customer/print-jobs/quote", {
            body: { pageCount: it.pages, printConfiguration: { ...it.config, pages: "all" as const, pageRange: undefined } },
          }),
        ),
    })),
  });
  const total = quotes.reduce((sum, q) => sum + Number(q.data?.cost ?? 0), 0);
  const quoting = quotes.some((q) => q.isFetching);
  const totalPages = items.reduce((s, it) => s + it.pages * it.config.copies, 0);

  const addFiles = async (files: File[]) => {
    const room = MAX_FILES - items.length;
    if (room <= 0) return toast.error(`A batch holds up to ${MAX_FILES} documents.`);
    setAdding(true);
    const next: Item[] = [];
    for (const file of files.slice(0, room)) {
      const kind = kindOf(file);
      if (kind === "unsupported" || (kind === "office" && !officeEnabled)) {
        toast.error(`${file.name} can't be printed here. Use PDF${officeEnabled ? ", Office" : ""} or images.`);
        continue;
      }
      let pages = 1;
      let orientation: PrintConfig["orientation"] = "portrait";
      if (kind === "pdf") {
        try {
          const info = await openPdf(file);
          pages = info.pageCount;
          orientation = info.orientation;
          await info.doc.destroy();
        } catch {
          toast.error(`${file.name} couldn't be read.`);
          continue;
        }
      }
      next.push({
        id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
        file,
        kind,
        pages,
        config: { ...DEFAULT_CONFIG, paper: papers[0]!, orientation },
      });
    }
    setItems((cur) => [...cur, ...next]);
    setAdding(false);
  };

  const update = (id: string, patch: Partial<Item>) => setItems((cur) => cur.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const move = (index: number, delta: number) =>
    setItems((cur) => {
      const copy = [...cur];
      const target = index + delta;
      if (target < 0 || target >= copy.length) return cur;
      [copy[index], copy[target]] = [copy[target]!, copy[index]!];
      return copy;
    });

  const submit = async () => {
    const form = new FormData();
    for (const it of items) form.append("files", it.file, it.file.name);
    form.append("items", JSON.stringify(items.map((it) => ({ printConfiguration: it.config }))));
    form.append("collate", String(collate));
    if (promo.trim()) form.append("promotionCode", promo.trim());
    setProgress(0);
    try {
      const data = await uploadDirect<{ job: { id: string } }>({
        purpose: "print-document",
        path: "/customer/print-jobs/batch",
        form,
        apiOrigin,
        headers: tenantHeaders,
        onProgress: setProgress,
      });
      await invalidate();
      await checkout(data.job.id);
      router.push(`/jobs/${data.job.id}`);
    } catch (err) {
      toast.error(errorMessage(err, "Upload failed."));
    } finally {
      setProgress(null);
    }
  };

  if (!shop) return <ShopRequired />;
  if (prices.isLoading) return <InlineLoader label="Loading prices…" />;

  return (
    <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6 items-start">
      <div className="space-y-4">
        <Dropzone
          accept={acceptFor(officeEnabled)}
          multiple
          onFiles={addFiles}
          hint={`Up to ${MAX_FILES} documents · each up to 50 MB`}
        />
        {adding ? <InlineLoader label="Reading documents…" /> : null}
        <ul className="space-y-3">
          {items.map((it, i) => {
            const q = quotes[i];
            const expanded = open === it.id;
            return (
              <li key={it.id} className="border-2 border-ink bg-paper-light">
                <div className="p-4 flex items-center gap-3">
                  <div className="flex flex-col">
                    <button type="button" aria-label="Move up" className="text-ink/40 hover:text-ink disabled:opacity-20" disabled={i === 0} onClick={() => move(i, -1)}>
                      <ChevronUp size={16} />
                    </button>
                    <GripVertical size={14} className="text-ink/20" aria-hidden="true" />
                    <button type="button" aria-label="Move down" className="text-ink/40 hover:text-ink disabled:opacity-20" disabled={i === items.length - 1} onClick={() => move(i, 1)}>
                      <ChevronDown size={16} />
                    </button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate">
                      <span className="pl-mono text-ink/40 mr-2">{String(i + 1).padStart(2, "0")}</span>
                      {it.file.name}
                    </div>
                    <div className="text-xs text-fog mt-0.5">
                      {it.pages} pg{it.kind === "office" ? " (est.)" : ""} · ×{it.config.copies} · {it.config.paper} ·{" "}
                      {it.config.color === "color" ? "Colour" : "B&W"} · {it.config.sided === "double" ? "Duplex" : "Single"} · {it.config.qualityDpi} dpi
                    </div>
                  </div>
                  <span className={cx("pl-mono font-bold tabular-nums", q?.isFetching && "opacity-50")}>{q?.data ? formatNaira(q.data.cost) : "—"}</span>
                  <button type="button" className="pl-btn-ghost pl-btn-sm" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : it.id)}>
                    {expanded ? "Done" : "Options"}
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${it.file.name}`}
                    className="text-ink/40 hover:text-persimmon"
                    onClick={() => setItems((cur) => cur.filter((x) => x.id !== it.id))}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                {expanded ? (
                  <div className="border-t-2 border-ink/10 p-4">
                    <PrintOptions
                      config={it.config}
                      onChange={(config) => update(it.id, { config: { ...config, pages: "all", pageRange: "" } })}
                      papers={papers}
                      colourAvailable={colourAvailable}
                      rangeable={false}
                      totalPages={it.pages}
                    />
                    {it.kind === "office" ? (
                      <label className="mt-4 flex items-center gap-2 text-sm">
                        Approx. pages
                        <input
                          type="number"
                          min={1}
                          className="pl-input w-24"
                          value={it.pages}
                          onChange={(e) => update(it.id, { pages: Math.max(1, Number(e.target.value) || 1) })}
                        />
                      </label>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      <aside className="lg:sticky lg:top-24 space-y-4">
        <Card>
          <div className="editorial-label">Batch total</div>
          <div className={cx("mt-1 pl-mono text-4xl font-bold tabular-nums", quoting && "opacity-60")}>{items.length ? formatNaira(total) : "—"}</div>
          <p className="text-sm text-fog mt-1">
            {items.length} document{items.length === 1 ? "" : "s"} · {totalPages} printed page{totalPages === 1 ? "" : "s"}
          </p>
          <div className="mt-4 space-y-3">
            <Checkbox
              checked={collate}
              onChange={(e) => setCollate(e.target.checked)}
              label="Collate"
              description="Print each set in order before starting the next copy."
            />
            <div>
              <label htmlFor="batch-promo" className="editorial-label block mb-1.5">
                Promo code
              </label>
              <input
                id="batch-promo"
                className="pl-input pl-mono uppercase"
                value={promo}
                maxLength={32}
                placeholder="Optional · applied at checkout"
                onChange={(e) => setPromo(e.target.value.toUpperCase())}
              />
            </div>
          </div>
        </Card>
        {items.some((i) => i.kind === "office") ? (
          <Notice tone="warn">Office files are converted on upload, so their page counts and price are confirmed then.</Notice>
        ) : null}
        {progress !== null ? (
          <div className="border-2 border-ink p-4">
            <div className="flex justify-between text-sm font-bold mb-2">
              <span>Uploading {items.length} files</span>
              <span className="pl-mono">{Math.round(progress * 100)}%</span>
            </div>
            <div className="h-2 bg-ink/10">
              <div className="h-full bg-persimmon transition-all" style={{ width: `${progress * 100}%` }} />
            </div>
          </div>
        ) : null}
        <Button className="w-full" arrow disabled={!items.length || quoting} loading={progress !== null} onClick={submit}>
          Pay {items.length ? formatNaira(total) : ""} &amp; get code
        </Button>
      </aside>
    </div>
  );
}
