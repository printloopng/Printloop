"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { cx } from "@printloop/ui";
import { renderPage } from "@/lib/pdf";

function Thumb({
  doc,
  page,
  grayscale,
  landscape,
}: {
  doc: PDFDocumentProxy;
  page: number;
  grayscale: boolean;
  landscape: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && setVisible(true), { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !canvas.current) return;
    renderPage(doc, page, canvas.current, landscape ? 220 : 160).catch(() => setFailed(true));
  }, [visible, doc, page, landscape]);

  return (
    <figure ref={holder} className="shrink-0 snap-start">
      <div className={cx("border-2 border-ink bg-white grid place-items-center overflow-hidden", landscape ? "w-[220px] min-h-[156px]" : "w-[160px] min-h-[226px]")}>
        {failed ? (
          <span className="text-xs text-fog p-4 text-center">Preview unavailable</span>
        ) : (
          <canvas ref={canvas} className={cx(grayscale && "grayscale")} aria-label={`Page ${page}`} />
        )}
      </div>
      <figcaption className="mt-1 text-center pl-mono text-[11px] text-ink/60">p. {page}</figcaption>
    </figure>
  );
}

export function PagePreview({
  doc,
  pages,
  grayscale,
  landscape,
}: {
  doc: PDFDocumentProxy;
  pages: number[];
  grayscale: boolean;
  landscape: boolean;
}) {
  const shown = pages.slice(0, 24);
  return (
    <div>
      <div className="flex gap-3 overflow-x-auto pb-3 snap-x">
        {shown.map((p) => (
          <Thumb key={p} doc={doc} page={p} grayscale={grayscale} landscape={landscape} />
        ))}
      </div>
      {pages.length > shown.length ? (
        <p className="text-xs text-fog">Showing the first {shown.length} of {pages.length} pages.</p>
      ) : null}
    </div>
  );
}
