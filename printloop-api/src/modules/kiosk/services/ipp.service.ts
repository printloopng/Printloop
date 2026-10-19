import ipp from 'ipp';
import { loadDocumentBytes } from '@/core/utils/fileStore';
import fs from 'node:fs';
import net from 'node:net';

export interface PrintOptions {
  copies?: number;
  
  sided?: 'single' | 'double';
  color?: 'bw' | 'color';
  paper?: string;
  
  orientation?: 'portrait' | 'landscape';
  
  qualityDpi?: 100 | 300 | 600;
  collate?: boolean;
  
  pages?: number[] | null;
  requestingUser?: string;
  
  secure?: boolean;
  port?: number;
  
  tlsRejectUnauthorized?: boolean;
  
  path?: string;
  
  version?: '1.0' | '1.1' | '2.0';
}

let cachedCa: Buffer | null | undefined;
function loadCa(): Buffer | undefined {
  if (cachedCa !== undefined) return cachedCa ?? undefined;
  const p = process.env.IPP_CA_CERT;
  try {
    cachedCa = p && fs.existsSync(p) ? fs.readFileSync(p) : null;
  } catch {
    cachedCa = null;
  }
  return cachedCa ?? undefined;
}

function buildPrinter(printerIp: string, opts: PrintOptions): any {
  const path = opts.path || '/ipp/print';
  const version = opts.version || '2.0';
  if (opts.secure) {
    const port = opts.port || 631;
    return new ipp.Printer(
      {
        protocol: 'https:',
        hostname: printerIp,
        host: `${printerIp}:${port}`,
        port,
        path,
        rejectUnauthorized: opts.tlsRejectUnauthorized === true,
        ca: loadCa(),
      } as any,
      { uri: `ipps://${printerIp}:${port}${path}`, version } as any,
    );
  }
  const port = opts.port || 631;
  return new ipp.Printer(`http://${printerIp}:${port}${path}`, { version } as any);
}

export type PrintSource =
  | { url: string }
  | { base64: string }
  | { buffer: Buffer };

const MEDIA: Record<string, string> = {
  A4: 'iso_a4_210x297mm',
  A3: 'iso_a3_297x420mm',
  LETTER: 'na_letter_8.5x11in',
  LEGAL: 'na_legal_8.5x14in',
};

function toPageRanges(pages?: number[] | null): Array<[number, number]> | undefined {
  if (!pages || !pages.length) return undefined;
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const ranges: Array<[number, number]> = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === prev + 1) {
      prev = sorted[i];
    } else {
      ranges.push([start, prev]);
      start = prev = sorted[i];
    }
  }
  ranges.push([start, prev]);
  return ranges;
}

export class IppService {
  
  private async resolveBytes(src: PrintSource): Promise<Buffer | null> {
    if ('buffer' in src) return src.buffer;
    if ('base64' in src) {
      const b64 = src.base64.replace(/^data:.*?;base64,/, '');
      return Buffer.from(b64, 'base64');
    }
    return loadDocumentBytes(src.url || '');
  }

  private buildJobAttributes(opts: PrintOptions) {
    const copies = Math.max(1, Number(opts.copies) || 1);
    const attrs: Record<string, any> = {
      copies,
      sides: opts.sided === 'double' ? 'two-sided-long-edge' : 'one-sided',
      'print-color-mode': opts.color === 'color' ? 'color' : 'monochrome',
      ...(opts.orientation === 'landscape'
        ? { 'orientation-requested': 4 }
        : {}),
    };
    const media = MEDIA[String(opts.paper || 'A4').toUpperCase()];
    if (media) attrs.media = media;

    if (copies > 1) {
      attrs['multiple-document-handling'] = opts.collate
        ? 'separate-documents-collated-copies'
        : 'separate-documents-uncollated-copies';
      attrs['sheet-collate'] = opts.collate ? 'collated' : 'uncollated';
    }

    const ranges = toPageRanges(opts.pages);
    if (ranges) {
      attrs['page-ranges'] = ranges.map(([lower, upper]) => ({ lower, upper }));
    }
    const q = Number(opts.qualityDpi) || 300;
    attrs['print-quality'] = q <= 100 ? 3 : q >= 600 ? 5 : 4;
    return attrs;
  }

  async printJob(
    printerIp: string,
    source: PrintSource,
    jobName: string,
    opts: PrintOptions = {}
  ): Promise<any> {
    const scheme = opts.secure ? 'ipps' : 'ipp';
    const port = opts.port || 631;
    const printerUrl = `${scheme}://${printerIp}:${port}${opts.path || '/ipp/print'}`;
    const bytes = await this.resolveBytes(source);

    if (!bytes) {
      const attrs = this.buildJobAttributes(opts);
      console.log(`[IPP] (dev) Would print "${jobName}" → ${printerUrl}`, attrs);
      return { mock: true, 'job-attributes-tag': { 'job-id': `mock-${Date.now()}` }, attrs };
    }

    const printer = buildPrinter(printerIp, opts);
    const msg = {
      'operation-attributes-tag': {
        'requesting-user-name': opts.requestingUser || 'PrintLoop',
        'job-name': jobName,
        'document-format': 'application/pdf',
      },
      'job-attributes-tag': this.buildJobAttributes(opts),
      data: bytes,
    };

    return new Promise((resolve, reject) => {
      printer.execute('Print-Job' as any, msg, (err: Error, res: any) => {
        if (err) {
          console.error('[IPP] Print error:', err.message);
          return reject(err);
        }
        const jobId = res?.['job-attributes-tag']?.['job-id'];
        console.log(`[IPP] Job accepted by ${printerUrl} — job-id ${jobId}`);
        resolve(res);
      });
    });
  }

  async rawPrint(
    printerIp: string,
    source: PrintSource,
    jobName: string,
    opts: PrintOptions = {},
    port = 9100,
  ): Promise<any> {
    const bytes = await this.resolveBytes(source);
    if (!bytes) {
      console.log(`[RAW] (dev) Would raw-print "${jobName}" → ${printerIp}:${port}`);
      return { mock: true };
    }

    const UEL = '\x1B%-12345X';
    const safe = (s: string) =>
      String(s || '').replace(/[^A-Za-z0-9 _.\-]/g, '_').slice(0, 80) || 'PrintLoop';
    const copies = Math.max(1, Math.min(99, Number(opts.copies) || 1));
    const sided = opts.sided === 'double';
    const colour = opts.color === 'color';
    const landscape = opts.orientation === 'landscape';
    const paper = String(opts.paper || 'A4').toUpperCase();
    const qualityDpi = Number(opts.qualityDpi) || 300;
    const resolution = qualityDpi >= 600 ? 600 : 300;
    const economy = qualityDpi <= 100;

    const pjl: string[] = [
      UEL + '@PJL',
      `@PJL JOB NAME="${safe(jobName)}"`,
      `@PJL SET COPIES=${copies}`,
      `@PJL SET DUPLEX=${sided ? 'ON' : 'OFF'}`,
      ...(sided ? [`@PJL SET BINDING=LONGEDGE`] : []),
      `@PJL SET RENDERMODE=${colour ? 'COLOR' : 'GRAYSCALE'}`,
      `@PJL SET PAPER=${paper}`,
      `@PJL SET ORIENTATION=${landscape ? 'LANDSCAPE' : 'PORTRAIT'}`,
      `@PJL SET RESOLUTION=${resolution}`,
      `@PJL SET ECONOMODE=${economy ? 'ON' : 'OFF'}`,
      `@PJL ENTER LANGUAGE=PDF`,
      '',
    ];
    const prologue = Buffer.from(pjl.join('\r\n'));
    const epilogue = Buffer.from('\r\n' + UEL);

    const total = prologue.length + bytes.length + epilogue.length;
    const sock = await this.openSocket(printerIp, port);
    return new Promise((resolve, reject) => {
      sock.setTimeout(120_000);
      sock.write(prologue);
      sock.write(bytes);
      sock.write(epilogue, () => sock.end());
      sock.once('end', () => {
        console.log(
          `[RAW] Job sent to ${printerIp}:${port} — "${jobName}" ${total}B ` +
            `(copies=${copies} sided=${opts.sided || 'single'} ` +
            `colour=${opts.color || 'bw'} paper=${paper} orient=${opts.orientation || 'portrait'})`,
        );
        resolve({ raw: true, transport: 'raw9100', bytes: total });
      });
      sock.once('timeout', () => {
        sock.destroy();
        reject(new Error('Raw print timeout'));
      });
      sock.once('error', (e) => {
        console.error('[RAW] socket error:', (e as any).message);
        reject(e);
      });
    });
  }

  async lprPrint(
    printerIp: string,
    source: PrintSource,
    jobName: string,
    opts: PrintOptions = {},
    port = 515,
  ): Promise<any> {
    const bytes = await this.resolveBytes(source);
    if (!bytes) {
      console.log(`[LPR] (dev) Would LPR print "${jobName}" → ${printerIp}:${port}`);
      return { mock: true };
    }

    const host = 'localhost';
    const user = opts.requestingUser || 'PrintLoop';
    const jobId = String(Math.floor(Math.random() * 900) + 100).padStart(3, '0');
    const queue = (opts.path && opts.path.replace(/^\//, '')) || 'raw';

    const controlContent = [
      `H${host}`,
      `P${user}`,
      `J${jobName}`,
      `ldfA${jobId}${host}`,
      `UdfA${jobId}${host}`,
    ].join('\n') + '\n';
    const controlBytes = Buffer.from(controlContent);

    const sock = await this.openSocket(printerIp, port);

    const waitAck = (): Promise<void> => {
      return new Promise((resolve, reject) => {
        sock.once('data', (data) => {
          if (data.length > 0 && data[0] === 0) {
            resolve();
          } else {
            reject(new Error(`LPR protocol error: expected ACK (0), got ${data.length > 0 ? data[0] : 'no-data'}`));
          }
        });
        sock.once('error', reject);
      });
    };

    return new Promise((resolve, reject) => {
      sock.setTimeout(120_000);
      sock.once('error', (err) => {
        sock.destroy();
        reject(err);
      });
      sock.once('timeout', () => {
        sock.destroy();
        reject(new Error('LPR connection timeout'));
      });

      (async () => {
        try {
          sock.write(Buffer.from(`\x02${queue}\n`));
          await waitAck();

          const controlFileCmd = `\x02${controlBytes.length} cfA${jobId}${host}\n`;
          sock.write(Buffer.from(controlFileCmd));
          await waitAck();

          sock.write(controlBytes);
          sock.write(Buffer.from('\x00'));
          await waitAck();

          const dataFileCmd = `\x03${bytes.length} dfA${jobId}${host}\n`;
          sock.write(Buffer.from(dataFileCmd));
          await waitAck();

          sock.write(bytes);
          sock.write(Buffer.from('\x00'));
          await waitAck();

          sock.end();
          console.log(`[LPR] Job sent to ${printerIp}:${port} (queue: ${queue}) — "${jobName}" ${bytes.length}B`);
          resolve({ lpr: true, transport: 'lpr', bytes: bytes.length });
        } catch (e) {
          sock.destroy();
          console.error('[LPR] protocol error:', (e as any).message);
          reject(e);
        }
      })();
    });
  }

  async emailPrint(
    printerEmail: string,
    source: PrintSource,
    jobName: string,
    opts: PrintOptions = {},
  ): Promise<any> {
    const bytes = await this.resolveBytes(source);
    if (!bytes) {
      console.log(`[EMAIL] (dev) Would email print "${jobName}" to ${printerEmail}`);
      return { mock: true };
    }

    const { EmailService } = await import('@/core/services/email.service');
    const emailService = new EmailService();
    const cleanFileName = jobName.replace(/[^A-Za-z0-9 _.\-]/g, '_') || 'document';
    const filename = cleanFileName.endsWith('.pdf') ? cleanFileName : `${cleanFileName}.pdf`;

    const success = await emailService.send({
      to: printerEmail,
      subject: `Print Job: ${jobName}`,
      html: `<p>Please print the attached document <strong>${jobName}</strong> from PrintLoop.</p>`,
      attachments: [
        {
          filename,
          content: bytes,
          contentType: 'application/pdf',
        },
      ],
    });

    console.log(`[EMAIL] ePrint sent to ${printerEmail} — success=${success}`);
    return { email: true, transport: 'email', success };
  }

  private async openSocket(host: string, port: number): Promise<net.Socket> {
    const proxy = process.env.TS_SOCKS5_PROXY;
    if (!proxy) {
      return await new Promise<net.Socket>((resolve, reject) => {
        const s = net.createConnection(port, host);
        s.once('connect', () => resolve(s));
        s.once('error', reject);
      });
    }

    const [proxyHost, proxyPortStr] = proxy.split(':');
    const proxyPort = Number(proxyPortStr) || 1055;
    const { SocksClient } = await import('socks');
    const { socket } = await SocksClient.createConnection({
      proxy: { host: proxyHost || 'localhost', port: proxyPort, type: 5 },
      command: 'connect',
      destination: { host, port },
      timeout: 30_000,
    });
    return socket as net.Socket;
  }

  async checkPrinterStatus(
    printerIp: string,
    opts: PrintOptions = {}
  ): Promise<{
    reachable: boolean;
    state?: string;
    reasons?: string[];
    raw?: any;
  }> {
    const printer = buildPrinter(printerIp, opts);
    const msg = {
      'operation-attributes-tag': {
        'requesting-user-name': 'PrintLoop',
        'requested-attributes': [
          'printer-state',
          'printer-state-reasons',
          'printer-is-accepting-jobs',
        ],
      },
    };
    return new Promise((resolve) => {
      try {
        printer.execute('Get-Printer-Attributes' as any, msg, (err: Error, res: any) => {
          if (err) {
            resolve({ reachable: false });
            return;
          }
          const p = res?.['printer-attributes-tag'] || {};
          resolve({
            reachable: true,
            state: p['printer-state'],
            reasons: ([] as string[]).concat(p['printer-state-reasons'] || []),
            raw: p,
          });
        });
      } catch {
        resolve({ reachable: false });
      }
    });
  }
}
