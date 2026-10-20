import { PDFDocument, PDFFont, StandardFonts, rgb } from 'pdf-lib';
import { extractPdfText, type PdfTextItem } from '@/core/utils/pdfText';

export interface UniverTextStyle {
  ff?: string;
  fs?: number;
  it?: 0 | 1;
  bl?: 0 | 1;
  ul?: { s: 0 | 1 };
  st?: { s: 0 | 1 };
  cl?: { rgb: string };
  bg?: { rgb: string };
}

export interface UniverParagraphStyle {
  horizontalAlign?: number;
  spaceAbove?: { v: number };
  spaceBelow?: { v: number };
  lineSpacing?: number;
  indentStart?: { v: number };
  indentFirstLine?: { v: number };
}

export interface UniverDocumentData {
  id: string;
  title?: string;
  body: {
    dataStream: string;
    textRuns?: Array<{ st: number; ed: number; ts: UniverTextStyle }>;
    paragraphs?: Array<{ startIndex: number; paragraphStyle?: UniverParagraphStyle }>;
    sectionBreaks?: Array<{ startIndex: number }>;
  };
  documentStyle: {
    pageSize: { width: number; height: number };
    marginTop: number;
    marginBottom: number;
    marginLeft: number;
    marginRight: number;
  };
}

export interface StoredEditorDocument {
  version: number;
  document: UniverDocumentData;
}

const ALIGN = { LEFT: 1, CENTER: 2, RIGHT: 3, JUSTIFIED: 4 } as const;
const PX_PER_PT = 96 / 72;
const A4_PT = { width: 595.28, height: 841.89 };
const MAX_IMPORT_PAGES = 80;

export interface ImportedParagraph {
  text: string;
  size: number;
  bold: boolean;
  align: number;
}

function cleanText(text: string): string {
  return text.replace(/[\u0000-\u0008\u000a-\u001f\u007f]/g, ' ').replace(/\u0009/g, '    ');
}

export function buildUniverDocument(
  id: string,
  title: string,
  paragraphs: ImportedParagraph[],
  pageSizePt = A4_PT,
): UniverDocumentData {
  let dataStream = '';
  const textRuns: NonNullable<UniverDocumentData['body']['textRuns']> = [];
  const paraEntries: NonNullable<UniverDocumentData['body']['paragraphs']> = [];
  const items = paragraphs.length ? paragraphs : [{ text: '', size: 12, bold: false, align: ALIGN.LEFT }];
  for (const p of items) {
    const text = cleanText(p.text);
    const st = dataStream.length;
    dataStream += text;
    if (text.length) {
      textRuns.push({ st, ed: dataStream.length, ts: { fs: Math.round(p.size * 2) / 2, bl: p.bold ? 1 : 0 } });
    }
    paraEntries.push({
      startIndex: dataStream.length,
      paragraphStyle: { horizontalAlign: p.align, spaceBelow: { v: Math.round(p.size * 0.5) } },
    });
    dataStream += '\r';
  }
  dataStream += '\n';
  const margin = 72 * PX_PER_PT;
  return {
    id,
    title,
    body: { dataStream, textRuns, paragraphs: paraEntries, sectionBreaks: [{ startIndex: dataStream.length - 1 }] },
    documentStyle: {
      pageSize: { width: pageSizePt.width * PX_PER_PT, height: pageSizePt.height * PX_PER_PT },
      marginTop: margin,
      marginBottom: margin,
      marginLeft: margin,
      marginRight: margin,
    },
  };
}

export function emptyUniverDocument(id: string, title: string, note?: string): UniverDocumentData {
  return buildUniverDocument(
    id,
    title,
    note ? [{ text: note, size: 12, bold: false, align: ALIGN.LEFT }] : [],
  );
}

export function isUniverDocument(value: unknown): value is UniverDocumentData {
  const doc = value as UniverDocumentData;
  return Boolean(doc && typeof doc === 'object' && doc.body && typeof doc.body.dataStream === 'string');
}

export interface TextLine {
  y: number;
  x: number;
  right: number;
  size: number;
  bold: boolean;
  text: string;
}

function mode(values: number[]): number {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = 12;
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

export function linesFromItems(items: PdfTextItem[]): TextLine[] {
  const lines: TextLine[] = [];
  let current: TextLine | null = null;
  for (const item of items) {
    const [a = 12, b = 0, , , x = 0, y = 0] = item.transform;
    const size = Math.max(1, Math.round(Math.hypot(a, b) * 2) / 2);
    const bold = /bold|black|heavy/i.test(item.font);
    if (current && Math.abs(current.y - y) <= Math.max(current.size, size) * 0.5) {
      if (item.str.length) {
        const gap = x - current.right;
        const needsSpace = gap > size * 0.2 && !current.text.endsWith(' ') && !item.str.startsWith(' ');
        current.text += (needsSpace ? ' ' : '') + item.str;
        current.right = Math.max(current.right, x + item.width);
        current.size = Math.max(current.size, size);
        current.bold = current.bold && bold;
      }
    } else if (item.str.trim().length) {
      current = { y, x, right: x + item.width, size, bold, text: item.str };
      lines.push(current);
    }
    if (item.hasEOL) current = null;
  }
  return lines.filter((l) => l.text.trim().length);
}

export function paragraphsFromPages(pages: Array<{ width: number; lines: TextLine[] }>): ImportedParagraph[] {
  const bodySize = mode(pages.flatMap((p) => p.lines.map((l) => l.size)));
  const paragraphs: ImportedParagraph[] = [];
  for (const page of pages) {
    let para: (ImportedParagraph & { lastY: number }) | null = null;
    for (const line of page.lines) {
      const centered =
        Math.abs((line.x + line.right) / 2 - page.width / 2) < page.width * 0.04 &&
        line.right - line.x < page.width * 0.7;
      const heading = line.size >= bodySize * 1.25;
      const align = centered ? ALIGN.CENTER : ALIGN.LEFT;
      const continues =
        para &&
        !heading &&
        Math.abs(para.size - line.size) < 0.6 &&
        para.align === align &&
        para.lastY - line.y > 0 &&
        para.lastY - line.y <= line.size * 1.7;
      if (para && continues) {
        const next = line.text.trim();
        para.text = para.text.endsWith('-') ? para.text.slice(0, -1) + next : `${para.text} ${next}`;
        para.lastY = line.y;
      } else {
        if (para) paragraphs.push(para);
        para = { text: line.text.trim(), size: line.size, bold: line.bold || heading, align, lastY: line.y };
      }
    }
    if (para) paragraphs.push(para);
  }
  return paragraphs.map(({ text, size, bold, align }) => ({ text, size, bold, align }));
}

export async function pdfToUniver(bytes: Buffer, id: string, title: string): Promise<UniverDocumentData> {
  const pages = await extractPdfText(bytes, MAX_IMPORT_PAGES);
  const first = pages[0];
  const pageSize = first ? { width: first.width, height: first.height } : A4_PT;
  const paragraphs = paragraphsFromPages(pages.map((p) => ({ width: p.width, lines: linesFromItems(p.items) })));
  return buildUniverDocument(id, title, paragraphs, pageSize);
}

interface Segment {
  text: string;
  style: UniverTextStyle;
}

interface Paragraph {
  segments: Segment[];
  style: UniverParagraphStyle;
}

export function univerParagraphs(doc: UniverDocumentData): Paragraph[] {
  const ds = doc.body?.dataStream ?? '';
  const runs = [...(doc.body?.textRuns ?? [])].sort((a, b) => a.st - b.st);
  const paraStyles = new Map((doc.body?.paragraphs ?? []).map((p) => [p.startIndex, p.paragraphStyle ?? {}]));
  const result: Paragraph[] = [];
  let start = 0;
  for (let i = 0; i < ds.length; i++) {
    if (ds[i] !== '\r') continue;
    const segments: Segment[] = [];
    let cursor = start;
    for (const run of runs) {
      if (run.ed <= start || run.st >= i) continue;
      const st = Math.max(run.st, start);
      const ed = Math.min(run.ed, i);
      if (st > cursor) segments.push({ text: ds.slice(cursor, st), style: {} });
      segments.push({ text: ds.slice(st, ed), style: run.ts ?? {} });
      cursor = ed;
    }
    if (cursor < i) segments.push({ text: ds.slice(cursor, i), style: {} });
    result.push({
      segments: segments
        .map((s) => ({ ...s, text: s.text.replace(/[\u0000-\u0008\u000b-\u001f]/g, '') }))
        .filter((s) => s.text.length),
      style: paraStyles.get(i) ?? {},
    });
    start = i + 1;
  }
  return result;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function safeColor(value?: string): string | null {
  return value && /^#[0-9a-f]{3,8}$/i.test(value) ? value : null;
}

function safeFont(value?: string): string | null {
  return value && /^[\w\s-]{1,48}$/.test(value) ? value : null;
}

function cssForRun(style: UniverTextStyle): string {
  const css: string[] = [];
  if (style.fs) css.push(`font-size:${Number(style.fs)}pt`);
  if (style.bl) css.push('font-weight:700');
  if (style.it) css.push('font-style:italic');
  const deco = [style.ul?.s ? 'underline' : '', style.st?.s ? 'line-through' : ''].filter(Boolean).join(' ');
  if (deco) css.push(`text-decoration:${deco}`);
  const color = safeColor(style.cl?.rgb);
  if (color) css.push(`color:${color}`);
  const bg = safeColor(style.bg?.rgb);
  if (bg) css.push(`background-color:${bg}`);
  const font = safeFont(style.ff);
  if (font) css.push(`font-family:'${font}',serif`);
  return css.join(';');
}

const ALIGN_CSS: Record<number, string> = { 1: 'left', 2: 'center', 3: 'right', 4: 'justify' };

export function univerToHtml(doc: UniverDocumentData): string {
  const page = doc.documentStyle?.pageSize ?? { width: A4_PT.width * PX_PER_PT, height: A4_PT.height * PX_PER_PT };
  const pt = (px: number) => `${(px / PX_PER_PT).toFixed(1)}pt`;
  const margins = doc.documentStyle ?? { marginTop: 96, marginBottom: 96, marginLeft: 96, marginRight: 96 };
  const body = univerParagraphs(doc)
    .map((p) => {
      const css: string[] = [];
      const align = ALIGN_CSS[p.style.horizontalAlign ?? 1];
      if (align && align !== 'left') css.push(`text-align:${align}`);
      if (p.style.spaceAbove?.v) css.push(`margin-top:${Number(p.style.spaceAbove.v)}pt`);
      css.push(`margin-bottom:${Number(p.style.spaceBelow?.v ?? 0)}pt`);
      if (p.style.indentFirstLine?.v) css.push(`text-indent:${Number(p.style.indentFirstLine.v)}pt`);
      if (p.style.indentStart?.v) css.push(`margin-left:${Number(p.style.indentStart.v)}pt`);
      const inner = p.segments.length
        ? p.segments
            .map((s) => {
              const style = cssForRun(s.style);
              const text = escapeHtml(s.text);
              return style ? `<span style="${style}">${text}</span>` : text;
            })
            .join('')
        : '&nbsp;';
      return `<p style="${css.join(';')}">${inner}</p>`;
    })
    .join('\n');
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(doc.title ?? 'Document')}</title>
<style>
@page { size: ${pt(page.width)} ${pt(page.height)}; margin: ${pt(margins.marginTop)} ${pt(margins.marginRight)} ${pt(margins.marginBottom)} ${pt(margins.marginLeft)}; }
body { font-family: 'Times New Roman', 'Liberation Serif', serif; font-size: 12pt; line-height: 1.35; margin: 0; }
p { margin-top: 0; white-space: pre-wrap; }
</style></head><body>
${body}
</body></html>`;
}

function hexToRgb(hex?: string) {
  const color = safeColor(hex);
  if (!color) return rgb(0, 0, 0);
  const full = color.length === 4 ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}` : color.slice(0, 7);
  const n = parseInt(full.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export async function univerToPdf(doc: UniverDocumentData): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(doc.title ?? 'Edited document');
  pdf.setProducer('PrintLoop');
  const fonts = {
    regular: await pdf.embedFont(StandardFonts.TimesRoman),
    bold: await pdf.embedFont(StandardFonts.TimesRomanBold),
    italic: await pdf.embedFont(StandardFonts.TimesRomanItalic),
    boldItalic: await pdf.embedFont(StandardFonts.TimesRomanBoldItalic),
  };
  const fontFor = (s: UniverTextStyle): PDFFont =>
    s.bl && s.it ? fonts.boldItalic : s.bl ? fonts.bold : s.it ? fonts.italic : fonts.regular;
  const encodable = new Map<string, boolean>();
  const toWinAnsi = (text: string) =>
    Array.from(text.normalize('NFD').replace(/[̀-ͯ]/g, ''))
      .map((ch) => {
        if (!encodable.has(ch)) {
          try {
            fonts.regular.encodeText(ch);
            encodable.set(ch, true);
          } catch {
            encodable.set(ch, false);
          }
        }
        return encodable.get(ch) ? ch : '?';
      })
      .join('');

  const style = doc.documentStyle;
  const width = (style?.pageSize?.width ?? A4_PT.width * PX_PER_PT) / PX_PER_PT;
  const height = (style?.pageSize?.height ?? A4_PT.height * PX_PER_PT) / PX_PER_PT;
  const mt = (style?.marginTop ?? 96) / PX_PER_PT;
  const mb = (style?.marginBottom ?? 96) / PX_PER_PT;
  const ml = (style?.marginLeft ?? 96) / PX_PER_PT;
  const mr = (style?.marginRight ?? 96) / PX_PER_PT;
  const usable = Math.max(72, width - ml - mr);

  let page = pdf.addPage([width, height]);
  let y = height - mt;

  for (const para of univerParagraphs(doc)) {
    const tokens: Array<{ text: string; style: UniverTextStyle; font: PDFFont; size: number }> = [];
    for (const seg of para.segments) {
      const size = Math.min(72, Math.max(4, Number(seg.style.fs) || 12));
      const font = fontFor(seg.style);
      for (const part of toWinAnsi(seg.text).split(/(\s+)/)) {
        if (part.length) tokens.push({ text: part, style: seg.style, font, size });
      }
    }
    const lines: Array<typeof tokens> = [];
    let line: typeof tokens = [];
    let lineWidth = 0;
    for (const token of tokens) {
      const w = token.font.widthOfTextAtSize(token.text, token.size);
      const isSpace = /^\s+$/.test(token.text);
      if (!isSpace && lineWidth + w > usable && line.length) {
        while (line.length && /^\s+$/.test(line[line.length - 1]!.text)) line.pop();
        lines.push(line);
        line = [];
        lineWidth = 0;
      }
      if (isSpace && !line.length) continue;
      line.push(token);
      lineWidth += w;
    }
    if (line.length || !lines.length) lines.push(line);

    const spaceAbove = Number(para.style.spaceAbove?.v ?? 0);
    const spaceBelow = Number(para.style.spaceBelow?.v ?? 0);
    y -= spaceAbove;
    for (const l of lines) {
      const size = l.reduce((m, t) => Math.max(m, t.size), 12);
      const lineHeight = size * 1.3;
      if (y - lineHeight < mb) {
        page = pdf.addPage([width, height]);
        y = height - mt;
      }
      y -= lineHeight;
      const total = l.reduce((sum, t) => sum + t.font.widthOfTextAtSize(t.text, t.size), 0);
      const align = para.style.horizontalAlign ?? ALIGN.LEFT;
      let x = ml + (align === ALIGN.CENTER ? (usable - total) / 2 : align === ALIGN.RIGHT ? usable - total : 0);
      for (const t of l) {
        const w = t.font.widthOfTextAtSize(t.text, t.size);
        const color = hexToRgb(t.style.cl?.rgb);
        page.drawText(t.text, { x, y: y + size * 0.25, size: t.size, font: t.font, color });
        if (t.style.ul?.s) page.drawLine({ start: { x, y: y + size * 0.15 }, end: { x: x + w, y: y + size * 0.15 }, thickness: 0.6, color });
        if (t.style.st?.s) page.drawLine({ start: { x, y: y + size * 0.55 }, end: { x: x + w, y: y + size * 0.55 }, thickness: 0.6, color });
        x += w;
      }
    }
    y -= spaceBelow;
  }
  return Buffer.from(await pdf.save());
}
