import { PDFDocument, PDFName, PDFArray, PDFDict, type PDFPage } from 'pdf-lib';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);

export class UnsupportedDocumentError extends Error {
  code = 'UNSUPPORTED_DOCUMENT';
  constructor(msg: string) {
    super(msg);
  }
}

const IMAGE_EXT = ['png', 'jpg', 'jpeg'];
export const ALLOWED_LABEL = 'PDF, JPG, PNG';

function extOf(name: string): string {
  return (name.split('.').pop() || '').toLowerCase();
}
export function isPdf(buf: Buffer): boolean {
  return buf.subarray(0, 5).toString('latin1') === '%PDF-';
}

export async function countPages(input: Buffer, fileName: string): Promise<number> {
  const ext = extOf(fileName);
  if (IMAGE_EXT.includes(ext) && !isPdf(input)) return 1;
  try {
    const pdf = await PDFDocument.load(input, {
      updateMetadata: false,
      ignoreEncryption: false,
    });
    const n = pdf.getPageCount();
    if (!Number.isFinite(n) || n < 1) throw new Error('no pages');
    return n;
  } catch {
    throw new UnsupportedDocumentError(
      `Could not read "${fileName}". It must be an unencrypted PDF or a JPG/PNG image.`
    );
  }
}

export function isPrintableDocument(fileName: string, mime?: string): boolean {
  const ext = extOf(fileName || '');
  if (ext === 'pdf' || IMAGE_EXT.includes(ext)) return true;
  const m = (mime || '').toLowerCase();
  return m === 'application/pdf' || m === 'image/png' || m === 'image/jpeg' || m === 'image/jpg';
}

async function imageToPdf(buf: Buffer, ext: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const img = ext === 'png' ? await pdf.embedPng(buf) : await pdf.embedJpg(buf);
  const A4 = { w: 595.28, h: 841.89 };
  const scale = Math.min(A4.w / img.width, A4.h / img.height, 1);
  const w = img.width * scale;
  const h = img.height * scale;
  const page = pdf.addPage([A4.w, A4.h]);
  page.drawImage(img, { x: (A4.w - w) / 2, y: (A4.h - h) / 2, width: w, height: h });
  return Buffer.from(await pdf.save());
}

export async function ensurePdf(
  input: Buffer,
  fileName: string
): Promise<{ buffer: Buffer; converted: boolean; from: string }> {
  const ext = extOf(fileName);
  if (isPdf(input) || ext === 'pdf') {
    return { buffer: input, converted: false, from: 'pdf' };
  }
  if (IMAGE_EXT.includes(ext)) {
    return { buffer: await imageToPdf(input, ext), converted: true, from: ext };
  }
  throw new UnsupportedDocumentError(
    `Unsupported file type ".${ext || 'unknown'}". PrintLoop prints ${ALLOWED_LABEL} only.`
  );
}

export function billablePages(docPages: number, cfg: { pages?: string; pageRange?: string } | null | undefined): number {
  const total = Math.max(1, Number(docPages) || 1);
  if (!cfg || cfg.pages !== 'range' || !cfg.pageRange) return total;
  const picked = parsePageRange(String(cfg.pageRange), total);
  return picked.length > 0 ? picked.length : total;
}

export function parsePageRange(rangeStr: string | undefined | null, totalPages: number): number[] {
  if (!rangeStr || typeof rangeStr !== 'string') return [];
  const cap = Math.max(0, Math.floor(totalPages) || 0);
  if (cap === 0) return [];
  const seen = new Set<number>();
  for (const chunk of rangeStr.split(',')) {
    const piece = chunk.trim();
    if (!piece) continue;
    const openEnd = piece.match(/^(\d+)\s*-\s*$/);
    if (openEnd) {
      for (let p = +openEnd[1]; p <= cap; p++) {
        if (p >= 1) seen.add(p);
      }
      continue;
    }
    const closed = piece.match(/^(\d+)\s*-\s*(\d+)$/);
    if (closed) {
      const lo = Math.max(1, +closed[1]);
      const hi = Math.min(cap, +closed[2]);
      for (let p = lo; p <= hi; p++) seen.add(p);
      continue;
    }
    if (/^\d+$/.test(piece)) {
      const p = +piece;
      if (p >= 1 && p <= cap) seen.add(p);
    }
  }
  return Array.from(seen).sort((a, b) => a - b);
}

export async function extractPages(input: Buffer, pageNumbers: number[]): Promise<Buffer> {
  if (!pageNumbers || pageNumbers.length === 0) return input;
  const source = await PDFDocument.load(input, { updateMetadata: false }).catch(() => null);
  if (!source) return input;
  const total = source.getPageCount();
  const indices = pageNumbers
    .filter((p) => Number.isFinite(p) && p >= 1 && p <= total)
    .map((p) => Math.floor(p) - 1);
  if (indices.length === 0) return input;
  const isIdentity = indices.length === total && indices.every((v, i) => v === i);
  if (isIdentity) return input;

  const out = await PDFDocument.create();
  const copied = await out.copyPages(source, indices);
  for (const page of copied) out.addPage(page);
  return Buffer.from(await out.save());
}

const RASTER_DPI = 200;

let pdfjsModule: any;
export async function loadPdfjs(): Promise<any> {
  if (pdfjsModule) return pdfjsModule;
  if (typeof (Promise as any).withResolvers !== 'function') {
    (Promise as any).withResolvers = function <T>() {
      let resolve!: (value: T | PromiseLike<T>) => void;
      let reject!: (reason?: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };
  }
  pdfjsModule = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjsModule;
}

let cachedFontUrl: string | undefined;
export function standardFontDataUrl(): string {
  if (cachedFontUrl) return cachedFontUrl;
  const require = createRequire(__filename);
  const pkgJson = require.resolve('pdfjs-dist/package.json');
  cachedFontUrl = pathToFileURL(path.join(path.dirname(pkgJson), 'standard_fonts') + path.sep).href;
  return cachedFontUrl;
}

function annotatedPageIndices(pdf: PDFDocument): Set<number> {
  const result = new Set<number>();
  const pages = pdf.getPages();
  for (let i = 0; i < pages.length; i++) {
    let annots: PDFArray | undefined;
    try {
      annots = pages[i].node.lookup(PDFName.of('Annots'), PDFArray);
    } catch {
      annots = undefined;
    }
    if (!annots || annots.size() === 0) continue;
    for (let a = 0; a < annots.size(); a++) {
      let dict: PDFDict | undefined;
      try {
        dict = pdf.context.lookup(annots.get(a), PDFDict);
      } catch {
        dict = undefined;
      }
      const subtype = dict?.lookup(PDFName.of('Subtype'))?.toString();
      if (subtype && subtype !== '/Popup' && subtype !== '/Link') {
        result.add(i);
        break;
      }
    }
  }
  return result;
}

async function rasterizeAnnotatedPages(
  input: Buffer,
  src: PDFDocument,
  annotated: Set<number>,
): Promise<Buffer> {
  const pdfjs = await loadPdfjs();
  const { createCanvas } = await import('@napi-rs/canvas');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(input),
    standardFontDataUrl: standardFontDataUrl(),
    isEvalSupported: false,
  }).promise;

  try {
    const out = await PDFDocument.create();
    const count = src.getPageCount();
    const scale = RASTER_DPI / 72;

    const vectorIdx: number[] = [];
    for (let i = 0; i < count; i++) if (!annotated.has(i)) vectorIdx.push(i);
    const copied = vectorIdx.length ? await out.copyPages(src, vectorIdx) : [];
    const vectorPage = new Map<number, PDFPage>();
    vectorIdx.forEach((origIdx, k) => vectorPage.set(origIdx, copied[k]));

    for (let i = 0; i < count; i++) {
      const vec = vectorPage.get(i);
      if (vec) {
        out.addPage(vec);
        continue;
      }
      const page = await doc.getPage(i + 1);
      const ptsViewport = page.getViewport({ scale: 1 });
      const pxViewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(pxViewport.width), Math.ceil(pxViewport.height));
      const cctx = canvas.getContext('2d');
      cctx.fillStyle = 'white';
      cctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({
        canvasContext: cctx as any,
        viewport: pxViewport,
        annotationMode: pdfjs.AnnotationMode.ENABLE,
      }).promise;
      page.cleanup();
      const img = await out.embedPng(canvas.toBuffer('image/png'));
      const p = out.addPage([ptsViewport.width, ptsViewport.height]);
      p.drawImage(img, { x: 0, y: 0, width: ptsViewport.width, height: ptsViewport.height });
    }

    return Buffer.from(await out.save());
  } finally {
    await doc.cleanup();
    await doc.destroy();
  }
}

export async function flattenAnnotations(input: Buffer): Promise<Buffer> {
  if (!isPdf(input)) return input;

  let src: PDFDocument;
  try {
    src = await PDFDocument.load(input, { updateMetadata: false });
  } catch {
    return input;
  }

  const annotated = annotatedPageIndices(src);
  if (annotated.size === 0) return input;

  try {
    return await rasterizeAnnotatedPages(input, src, annotated);
  } catch (e: any) {
    console.warn('[documentConvert] flattenAnnotations failed, sending original:', e?.message);
    return input;
  }
}

function gsCandidates(): string[] {
  const override = process.env.GHOSTSCRIPT_BIN;
  if (override) return [override];
  if (process.platform === 'win32') return ['gswin64c', 'gswin32c'];
  return ['gs'];
}

let cachedGsBin: string | null | undefined;

async function resolveGsBinary(): Promise<string | null> {
  if (cachedGsBin !== undefined) return cachedGsBin;
  for (const bin of gsCandidates()) {
    try {
      await execFileAsync(bin, ['--version'], { timeout: 5000 });
      cachedGsBin = bin;
      return bin;
    } catch {
    }
  }
  cachedGsBin = null;
  return null;
}

export async function ghostscriptAvailable(): Promise<boolean> {
  return (await resolveGsBinary()) !== null;
}

export async function toGrayscale(pdfBytes: Buffer): Promise<Buffer> {
  const bin = await resolveGsBinary();
  if (!bin) {
    console.warn(
      '[documentConvert] Ghostscript not found — cannot force grayscale; ' +
        'sending original (color) PDF. Install ghostscript to enable B&W enforcement.',
    );
    return pdfBytes;
  }

  const stamp = crypto.randomBytes(8).toString('hex');
  const inPath = path.join(os.tmpdir(), `pl-gs-${stamp}-in.pdf`);
  const outPath = path.join(os.tmpdir(), `pl-gs-${stamp}-out.pdf`);

  try {
    await fs.writeFile(inPath, pdfBytes);
    await execFileAsync(
      bin,
      [
        '-sDEVICE=pdfwrite',
        '-sColorConversionStrategy=Gray',
        '-dProcessColorModel=/DeviceGray',
        '-dNOPAUSE',
        '-dBATCH',
        '-dSAFER',
        '-dQUIET',
        `-sOutputFile=${outPath}`,
        inPath,
      ],
      { timeout: 120000, maxBuffer: 64 * 1024 * 1024 },
    );
    const out = await fs.readFile(outPath);
    if (!out || out.length === 0) throw new Error('Ghostscript produced an empty file');
    return out;
  } catch (e: any) {
    console.warn('[documentConvert] grayscale conversion failed, sending original:', e?.message);
    return pdfBytes;
  } finally {
    fs.unlink(inPath).catch(() => {});
    fs.unlink(outPath).catch(() => {});
  }
}

export async function fitToOrientation(
  input: Buffer,
  target: 'portrait' | 'landscape',
): Promise<Buffer> {
  if (!isPdf(input)) return input;

  let src: PDFDocument;
  try {
    src = await PDFDocument.load(input, { updateMetadata: false });
  } catch {
    return input;
  }

  const wantLandscape = target === 'landscape';

  try {
    const pages = src.getPages();
    const needsFit = pages.some((p) => {
      const { width, height } = p.getSize();
      return width !== height && width > height !== wantLandscape;
    });
    if (!needsFit) return input;

    const out = await PDFDocument.create();
    const embedded = await out.embedPages(pages);
    for (let i = 0; i < pages.length; i++) {
      const { width: w, height: h } = pages[i].getSize();
      const pageLandscape = w > h;
      if (w === h || pageLandscape === wantLandscape) {
        const p = out.addPage([w, h]);
        p.drawPage(embedded[i], { x: 0, y: 0, width: w, height: h });
        continue;
      }
      const long = Math.max(w, h);
      const short = Math.min(w, h);
      const sheetW = wantLandscape ? long : short;
      const sheetH = wantLandscape ? short : long;
      const scale = Math.min(sheetW / w, sheetH / h);
      const dw = w * scale;
      const dh = h * scale;
      const p = out.addPage([sheetW, sheetH]);
      p.drawPage(embedded[i], {
        x: (sheetW - dw) / 2,
        y: (sheetH - dh) / 2,
        width: dw,
        height: dh,
      });
    }
    return Buffer.from(await out.save());
  } catch (e: any) {
    console.warn('[documentConvert] fitToOrientation failed, sending original:', e?.message);
    return input;
  }
}

export type PrinterLang = 'ps' | 'pcl';

export interface RenderToPrinterOpts {
  lang: PrinterLang;
  
  color?: 'bw' | 'color';
  
  dpi?: number;
  
  duplex?: boolean;
  
  copies?: number;
}

export async function renderToPrinterLanguage(
  pdf: Buffer,
  opts: RenderToPrinterOpts,
): Promise<Buffer | null> {
  if (!isPdf(pdf)) return null;
  const bin = await resolveGsBinary();
  if (!bin) return null;

  const dpi = [150, 300, 600, 1200].includes(Number(opts.dpi)) ? Number(opts.dpi) : 600;
  const copies = Math.max(1, Math.min(99, Number(opts.copies) || 1));
  const gray = opts.color !== 'color';

  const stamp = crypto.randomBytes(8).toString('hex');
  const inPath = path.join(os.tmpdir(), `pl-rn-${stamp}-in.pdf`);
  const outPath = path.join(os.tmpdir(), `pl-rn-${stamp}-out.${opts.lang}`);

  const args = ['-q', '-dNOPAUSE', '-dBATCH', '-dSAFER', `-r${dpi}`];
  if (opts.lang === 'pcl') {
    args.push(`-sDEVICE=${gray ? 'pxlmono' : 'pxlcolor'}`);
    if (opts.duplex) args.push('-dDuplex=true');
    args.push(`-sOutputFile=${outPath}`, inPath);
  } else {
    args.push('-sDEVICE=ps2write');
    if (gray) args.push('-sColorConversionStrategy=Gray', '-dProcessColorModel=/DeviceGray');
    args.push(`-sOutputFile=${outPath}`);
    const dev: string[] = [];
    if (opts.duplex) dev.push('/Duplex true', '/Tumble false');
    if (copies > 1) dev.push(`/NumCopies ${copies}`);
    if (dev.length) args.push('-c', `<<${dev.join(' ')}>> setpagedevice`, '-f', inPath);
    else args.push(inPath);
  }

  try {
    await fs.writeFile(inPath, pdf);
    await execFileAsync(bin, args, { timeout: 120000, maxBuffer: 128 * 1024 * 1024 });
    const out = await fs.readFile(outPath);
    if (!out || out.length === 0) throw new Error('Ghostscript produced an empty file');
    return out;
  } catch (e: any) {
    console.warn('[documentConvert] renderToPrinterLanguage failed:', e?.message);
    return null;
  } finally {
    fs.unlink(inPath).catch(() => {});
    fs.unlink(outPath).catch(() => {});
  }
}

export async function rasterRenderAvailable(): Promise<boolean> {
  try {
    await loadPdfjs();
    await import('@napi-rs/canvas');
    return true;
  } catch {
    return false;
  }
}
