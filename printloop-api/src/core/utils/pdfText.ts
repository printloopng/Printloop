import { Worker } from 'node:worker_threads';
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

const WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
(async () => {
  let doc;
  try {
    const pdfjs = await import(workerData.pdfjsUrl);
    doc = await pdfjs.getDocument({
      data: workerData.data,
      standardFontDataUrl: workerData.fontUrl,
      isEvalSupported: false,
      verbosity: 0,
    }).promise;
    const pages = [];
    const count = Math.min(doc.numPages, workerData.maxPages);
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
    parentPort.postMessage({ ok: true, pages });
  } catch (err) {
    parentPort.postMessage({ ok: false, error: String((err && err.message) || err) });
  } finally {
    if (doc) await doc.destroy().catch(() => {});
  }
})();
`;

export function extractPdfText(bytes: Buffer, maxPages = 80, timeoutMs = 45_000): Promise<PdfTextPage[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_SOURCE, {
      eval: true,
      workerData: {
        data: new Uint8Array(bytes),
        maxPages,
        fontUrl: standardFontDataUrl(),
        pdfjsUrl: pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href,
      },
      resourceLimits: { maxOldGenerationSizeMb: 512 },
    });
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(new Error('Reading the document took too long.'));
    }, timeoutMs);
    worker.once('message', (msg: { ok: boolean; pages?: PdfTextPage[]; error?: string }) => {
      clearTimeout(timer);
      void worker.terminate();
      if (msg.ok && msg.pages) resolve(msg.pages);
      else reject(new Error(msg.error || 'Could not read the document text.'));
    });
    worker.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
