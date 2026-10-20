"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";

let lib: Promise<typeof import("pdfjs-dist")> | null = null;

function pdfjs() {
  lib ??= import("pdfjs-dist").then((mod) => {
    mod.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    return mod;
  });
  return lib;
}

export const OFFICE_EXTENSIONS = ["doc", "docx", "rtf", "odt", "txt", "ppt", "pptx", "odp", "xls", "xlsx", "ods", "csv"];
export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp"];

export function extensionOf(name: string): string {
  return (name.split(".").pop() ?? "").toLowerCase();
}

export type DocKind = "pdf" | "image" | "office" | "unsupported";

export function kindOf(file: File): DocKind {
  const ext = extensionOf(file.name);
  if (ext === "pdf" || file.type === "application/pdf") return "pdf";
  if (IMAGE_EXTENSIONS.includes(ext) || file.type.startsWith("image/")) return "image";
  if (OFFICE_EXTENSIONS.includes(ext)) return "office";
  return "unsupported";
}

export function acceptFor(officeEnabled: boolean): string {
  const base = ".pdf,application/pdf,.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp";
  return officeEnabled ? `${base},${OFFICE_EXTENSIONS.map((e) => `.${e}`).join(",")}` : base;
}

export interface PdfInfo {
  doc: PDFDocumentProxy;
  pageCount: number;
  orientation: "portrait" | "landscape";
}

export async function openPdf(file: File): Promise<PdfInfo> {
  const mod = await pdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await mod.getDocument({ data, isEvalSupported: false }).promise;
  const first = await doc.getPage(1);
  const vp = first.getViewport({ scale: 1 });
  return { doc, pageCount: doc.numPages, orientation: vp.width > vp.height ? "landscape" : "portrait" };
}

export async function renderPage(doc: PDFDocumentProxy, pageNumber: number, canvas: HTMLCanvasElement, width: number) {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const viewport = page.getViewport({ scale: (width / base.width) * ratio });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${Math.floor(viewport.height / ratio)}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
}

export function parsePageRange(input: string, total: number): number[] {
  if (!input.trim() || total < 1) return [];
  const out = new Set<number>();
  for (const chunk of input.split(",")) {
    const part = chunk.trim();
    if (!part) continue;
    const open = /^(\d+)\s*-\s*$/.exec(part);
    const closed = /^(\d+)\s*-\s*(\d+)$/.exec(part);
    if (open) {
      for (let p = Number(open[1]); p <= total; p++) if (p >= 1) out.add(p);
    } else if (closed) {
      let a = Number(closed[1]);
      let b = Number(closed[2]);
      if (a > b) [a, b] = [b, a];
      for (let p = Math.max(1, a); p <= Math.min(total, b); p++) out.add(p);
    } else if (/^\d+$/.test(part)) {
      const p = Number(part);
      if (p >= 1 && p <= total) out.add(p);
    } else {
      return [];
    }
  }
  return [...out].sort((x, y) => x - y);
}
