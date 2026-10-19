import ipp from 'ipp';
import { logger } from '../utils/logger';
import { getSettings } from './settings';

export interface PrinterInfo {
  uri: string;
  name: string;
  makeAndModel: string;
  state: string;
  isDefault: boolean;
}

export interface TestPrintResult {
  success: boolean;
  error?: string;
}

export interface PrintOptions {
  mimeType: string;
  jobName: string;
  copies?: number;
  sided?: 'single' | 'double';
  color?: 'bw' | 'color';
  paper?: string;
}

export type PrinterState = 'idle' | 'processing' | 'stopped' | 'unreachable';

const IPP_TIMEOUT_MS = 15_000;
const PRINT_TIMEOUT_MS = 120_000;
const PRINTER_STATES: Record<number, PrinterState> = { 3: 'idle', 4: 'processing', 5: 'stopped' };
const MEDIA: Record<string, string> = {
  A4: 'iso_a4_210x297mm',
  A3: 'iso_a3_297x420mm',
  A5: 'iso_a5_148x210mm',
  LETTER: 'na_letter_8.5x11in',
  LEGAL: 'na_legal_8.5x14in',
};

// The `ipp` package is callback-only and has no request timeout.
function execute(printerUri: string, operation: string, msg: any, timeoutMs = IPP_TIMEOUT_MS): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Printer did not respond within ${timeoutMs / 1000}s`)),
      timeoutMs,
    );
    ipp.Printer(printerUri).execute(operation, msg, (err: unknown, res: any) => {
      clearTimeout(timer);
      if (err) return reject(err instanceof Error ? err : new Error(String(err)));
      if (res?.statusCode && !String(res.statusCode).startsWith('successful')) {
        return reject(new Error(`Printer rejected ${operation}: ${res.statusCode}`));
      }
      resolve(res);
    });
  });
}

async function getPrinterAttributes(printerUri: string): Promise<Record<string, any>> {
  const res = await execute(printerUri, 'Get-Printer-Attributes', {
    'operation-attributes-tag': {
      'requested-attributes': [
        'printer-name',
        'printer-make-and-model',
        'printer-state',
        'printer-state-reasons',
      ],
    },
  });
  return res?.['printer-attributes-tag'] ?? {};
}

/**
 * The `ipp` package can't discover printers, so this only reports the
 * configured printer (if reachable). Operators type the printer's IPP URI
 * in settings, e.g. ipp://192.168.1.50/ipp/print.
 */
export async function listPrinters(): Promise<PrinterInfo[]> {
  const uri = getSettings().printerUri;
  if (!uri) return [];
  try {
    const attrs = await getPrinterAttributes(uri);
    return [
      {
        uri,
        name: attrs['printer-name'] || uri,
        makeAndModel: attrs['printer-make-and-model'] || 'Unknown',
        state: PRINTER_STATES[attrs['printer-state']] ?? 'unknown',
        isDefault: true,
      },
    ];
  } catch (error) {
    logger.warn({ err: error, uri }, 'Configured printer not reachable');
    return [];
  }
}

export async function getPrinterState(printerUri: string): Promise<{ state: PrinterState; reasons?: string }> {
  try {
    const attrs = await getPrinterAttributes(printerUri);
    const reasons = [attrs['printer-state-reasons']].flat().filter((r) => r && r !== 'none').join(', ');
    return { state: PRINTER_STATES[attrs['printer-state']] ?? 'idle', reasons: reasons || undefined };
  } catch (error) {
    return { state: 'unreachable', reasons: error instanceof Error ? error.message : String(error) };
  }
}

export async function printDocument(
  printerUri: string,
  data: Buffer,
  opts: PrintOptions,
): Promise<{ jobId: string }> {
  const jobAttrs: Record<string, unknown> = {};
  if (opts.copies && opts.copies > 1) jobAttrs.copies = opts.copies;
  if (opts.sided) jobAttrs.sides = opts.sided === 'double' ? 'two-sided-long-edge' : 'one-sided';
  if (opts.color) jobAttrs['print-color-mode'] = opts.color === 'color' ? 'color' : 'monochrome';
  const media = opts.paper ? MEDIA[opts.paper.toUpperCase()] : undefined;
  if (media) jobAttrs.media = media;

  const msg: any = {
    'operation-attributes-tag': {
      'requesting-user-name': 'printloop-kiosk',
      'job-name': opts.jobName.slice(0, 255),
      'document-format': opts.mimeType,
    },
    data,
  };
  if (Object.keys(jobAttrs).length) msg['job-attributes-tag'] = jobAttrs;

  const res = await execute(printerUri, 'Print-Job', msg, PRINT_TIMEOUT_MS);
  const job = res?.['job-attributes-tag'] ?? {};
  // job-state 7+ = canceled / aborted.
  if (job['job-state'] >= 7) {
    throw new Error(`Printer aborted the job: ${job['job-state-reasons'] || 'unknown reason'}`);
  }
  return { jobId: String(job['job-id'] ?? 'unknown') };
}

export async function testPrinter(printerUri: string): Promise<TestPrintResult> {
  const { state, reasons } = await getPrinterState(printerUri);
  if (state === 'unreachable') return { success: false, error: reasons };
  if (state === 'stopped') return { success: false, error: `Printer stopped${reasons ? `: ${reasons}` : ''}` };
  return { success: true };
}
