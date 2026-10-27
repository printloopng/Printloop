import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { standardFontDataUrl } from '@/modules/public/services/documentConvert.service';

export interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  hasEOL: boolean;
  font: string;
}

export interface PdfTextPage {
  width: number;
  height: number;
  items: PdfTextItem[];
}

const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

const CHILD_SOURCE = `
const chunks = [];
process.stdin.on('data', (c) => chunks.push(c));
process.stdin.on('end', async () => {
  const cfg = JSON.parse(process.env.PDF_TEXT_CONFIG);
  let doc;
  let result;
  try {
    const pdfjs = await import(cfg.pdfjsUrl);
    doc = await pdfjs.getDocument({
      data: new Uint8Array(Buffer.concat(chunks)),
      standardFontDataUrl: cfg.fontUrl,
      isEvalSupported: false,
      verbosity: 0,
    }).promise;
    const pages = [];
    const count = Math.min(doc.numPages, cfg.maxPages);
    for (let n = 1; n <= count; n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      pages.push({
        width: viewport.width,
        height: viewport.height,
        items: content.items
          .filter((i) => typeof i.str === 'string')
          .map((i) => ({
            str: i.str,
            transform: i.transform,
            width: i.width || 0,
            hasEOL: Boolean(i.hasEOL),
            font: String((content.styles[i.fontName] || {}).fontFamily || '') + ' ' + String(i.fontName || ''),
          })),
      });
      page.cleanup();
    }
    result = { ok: true, pages };
  } catch (err) {
    result = { ok: false, error: String((err && err.message) || err) };
  }
  if (doc) await doc.destroy().catch(() => {});
  process.stdout.write(JSON.stringify(result), () => process.exit(0));
});
`;

export function extractPdfText(bytes: Buffer, maxPages = 80, timeoutMs = 45_000): Promise<PdfTextPage[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--max-old-space-size=512', '-e', CHILD_SOURCE], {
      stdio: ['pipe', 'pipe', 'ignore'],
      windowsHide: true,
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        PDF_TEXT_CONFIG: JSON.stringify({
          maxPages,
          fontUrl: standardFontDataUrl(),
          pdfjsUrl: pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href,
        }),
      },
    });

    const out: Buffer[] = [];
    let size = 0;
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      finish(() => reject(new Error('Reading the document took too long.')));
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_OUTPUT_BYTES) {
        finish(() => reject(new Error('The document has too much text to edit.')));
        child.kill('SIGKILL');
        return;
      }
      out.push(chunk);
    });
    child.on('error', (err) => finish(() => reject(err)));
    child.on('close', () =>
      finish(() => {
        try {
          const msg = JSON.parse(Buffer.concat(out).toString('utf8')) as { ok: boolean; pages?: PdfTextPage[]; error?: string };
          if (msg.ok && msg.pages) resolve(msg.pages);
          else reject(new Error(msg.error || 'Could not read the document text.'));
        } catch {
          reject(new Error('The document reader stopped unexpectedly.'));
        }
      }),
    );
    child.stdin.on('error', () => undefined);
    child.stdin.end(bytes);
  });
}
