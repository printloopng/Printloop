import { type Request, type Response, type NextFunction } from 'express';
import { AppDataSource } from '@/config/data-source';
import { User } from '@/database/entities/user.entity';
import { PrintJob, PrintJobStatus, JobType } from '@/database/entities/printJob.entity';
import { File } from '@/database/entities/file.entity';
import { saveBuffer } from '@/core/utils/fileStore';
import {
  isPrintableDocument,
  ALLOWED_LABEL,
  countPages,
  flattenAnnotations,
  UnsupportedDocumentError,
} from '@/modules/public/services/documentConvert.service';
import { getUploadLimits } from '@/core/utils/limits';
import { applyPromotion } from '@/modules/customer/services/promotion.service';
import { computeCost, type PrintConfiguration } from '@/modules/public/services/pricing.service';
import { PaystackService } from '@/core/services/paystack.service';
import { makeCode } from '@/core/utils/releaseCode';
import type { Tenant } from '@/database/entities/tenant.entity';

let warnedQueryTokenInProd = false;

async function initCheckout(
  user: User,
  jobId: string,
  cost: number,
  tenant: Tenant | undefined,
): Promise<string | null> {
  if (!process.env.PAYSTACK_SECRET_KEY) return null;
  try {
    const paystack = new PaystackService();
    const data = await paystack.initializeJobPayment(
      user.id,
      jobId,
      cost,
      user.email,
      tenant ?? undefined,
    );
    return data?.authorization_url ?? null;
  } catch (err: any) {
    console.warn('[cups] checkout init failed:', err?.message);
    return null;
  }
}

function cupsStatusMessage(
  code: string | null,
  cost: number,
  payUrl: string | null,
): string {
  if (payUrl) {
    return `PrintLoop release code: ${code} (₦${cost}). Pay at: ${payUrl}`;
  }
  return `PrintLoop release code: ${code} (₦${cost})`;
}

function extractToken(req: Request): string | null {
  const auth = req.header('authorization') || '';
  const m = auth.match(/^Bearer\s+([A-Za-z0-9._-]+)$/);
  if (m) return m[1];
  const h = req.header('x-printloop-token');
  if (h) return h;
  const q = req.query?.token;
  if (typeof q === 'string' && q) {
    if (process.env.NODE_ENV === 'production') {
      if (!warnedQueryTokenInProd) {
        console.warn(
          '[cups] refusing ?token= in production — tokens in URLs land in access logs. Use Authorization: Bearer.',
        );
        warnedQueryTokenInProd = true;
      }
      return null;
    }
    return q;
  }
  return null;
}

export function parseCupsOptions(raw: string | undefined): {
  paper: 'A4' | 'A3' | 'Letter' | 'Legal';
  color: 'bw' | 'color';
  sided: 'single' | 'double';
  copies: number;
  qualityDpi: 100 | 300 | 600;
  orientation: 'portrait' | 'landscape';
} {
  const out: Record<string, string> = {};
  const s = String(raw || '');
  const re = /([A-Za-z][\w-]*)=("[^"]*"|'[^']*'|\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    out[m[1].toLowerCase()] = m[2].replace(/^['"]|['"]$/g, '');
  }
  const mediaRaw = (out['media'] || out['pagesize'] || 'A4').toLowerCase();
  let paper: 'A4' | 'A3' | 'Letter' | 'Legal' = 'A4';
  if (mediaRaw.includes('a3')) paper = 'A3';
  else if (mediaRaw.includes('legal')) paper = 'Legal';
  else if (mediaRaw.includes('letter')) paper = 'Letter';
  else paper = 'A4';

  const sidesRaw = (out['sides'] || out['duplex'] || '').toLowerCase();
  const sided: 'single' | 'double' =
    sidesRaw.startsWith('two-sided') ||
    sidesRaw === 'duplexnotumble' ||
    sidesRaw === 'duplextumble'
      ? 'double'
      : 'single';

  const colorRaw = (
    out['print-color-mode'] ||
    out['colormodel'] ||
    out['outputmode'] ||
    ''
  ).toLowerCase();
  const color: 'bw' | 'color' = /color|rgb|cmyk/.test(colorRaw) ? 'color' : 'bw';

  const copies = Math.max(1, Math.min(99, parseInt(out['copies'] || '1', 10) || 1));

  const qRaw = (out['print-quality'] || out['quality'] || '').toLowerCase();
  let qualityDpi: 100 | 300 | 600 = 300;
  if (qRaw === '3' || qRaw === 'draft' || qRaw === 'low') qualityDpi = 100;
  else if (qRaw === '5' || qRaw === 'high' || qRaw === 'best') qualityDpi = 600;
  else qualityDpi = 300;

  const oRaw = (out['orientation-requested'] || out['orientation'] || '').toLowerCase();
  const orientation: 'portrait' | 'landscape' =
    oRaw === '4' || oRaw === '5' || /landscape/.test(oRaw) ? 'landscape' : 'portrait';

  return { paper, color, sided, copies, qualityDpi, orientation };
}

export class KioskCupsController {
  print = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = extractToken(req);
      if (!token) {
        res.status(401).json({ success: false, message: 'Print token required' });
        return;
      }
      const user = await AppDataSource.getRepository(User).findOne({
        where: { printToken: token },
      });
      if (!user) {
        res.status(401).json({ success: false, message: 'Invalid print token' });
        return;
      }
      if (user.isBlocked) {
        res.status(403).json({ success: false, message: 'Account is blocked' });
        return;
      }

      const file = req.file;
      if (!file) {
        res.status(400).json({ success: false, message: 'A document file is required' });
        return;
      }
      if (!isPrintableDocument(file.originalname || '', file.mimetype)) {
        res.status(415).json({
          success: false,
          message: `Unsupported file type. PrintLoop prints ${ALLOWED_LABEL} only.`,
          code: 'UNSUPPORTED_DOCUMENT',
        });
        return;
      }

      const limits = await getUploadLimits();
      if (file.size > limits.maxFileBytes) {
        res.status(413).json({
          success: false,
          message: `File too large. Max ${Math.round(limits.maxFileBytes / 1048576)} MB.`,
          code: 'FILE_TOO_LARGE',
        });
        return;
      }
      const pdfBytes = await flattenAnnotations(file.buffer);
      let pageCount: number;
      try {
        pageCount = await countPages(pdfBytes, file.originalname || 'document.pdf');
      } catch (e: any) {
        res.status(e instanceof UnsupportedDocumentError ? 415 : 422).json({
          success: false,
          message: e?.message || 'Could not read the document.',
          code: e?.code || 'UNREADABLE_DOCUMENT',
        });
        return;
      }
      if (pageCount > limits.maxPages) {
        res.status(413).json({
          success: false,
          message: `Document has ${pageCount} pages; the limit is ${limits.maxPages}.`,
          code: 'TOO_MANY_PAGES',
        });
        return;
      }

      const cups = parseCupsOptions(req.body?.options);
      const explicitCopies = parseInt(req.body?.copies || '1', 10) || 1;
      const copies = Math.max(cups.copies, explicitCopies);
      const printConfiguration: PrintConfiguration = {
        copies,
        paper: cups.paper,
        color: cups.color,
        sided: cups.sided,
        qualityDpi: cups.qualityDpi,
        orientation: cups.orientation,
      };
      const baseCost = await computeCost({
        tenantId: req.tenant?.id ?? user.tenantId,
        pageCount,
        copies: printConfiguration.copies,
        paper: printConfiguration.paper,
        color: printConfiguration.color,
        sided: printConfiguration.sided,
        qualityDpi: printConfiguration.qualityDpi,
      });
      const promo = await applyPromotion(baseCost, req.body?.promotionCode, {
        tenantId: req.tenant?.id ?? user.tenantId,
        pageCount,
        perPageBw: 5,
      });
      const cost = promo.cost;

      const idempotencyKey =
        req.header('idempotency-key') ||
        (typeof req.body?.idempotencyKey === 'string' ? req.body.idempotencyKey : '') ||
        '';
      const jobRepo = AppDataSource.getRepository(PrintJob);
      if (idempotencyKey) {
        const existing = await jobRepo.findOne({
          where: { userId: user.id, idempotencyKey },
        });
        if (existing) {
          let payUrl: string | null = null;
          if (existing.status === PrintJobStatus.PENDING) {
            payUrl = await initCheckout(user, existing.id, Number(existing.cost), req.tenant);
          }
          res.json({
            success: true,
            data: {
              code: existing.code,
              cost: Number(existing.cost),
              pages: existing.totalPages,
              copies: (existing.printConfiguration as any)?.copies ?? copies,
              config: existing.printConfiguration,
              payUrl,
              message: cupsStatusMessage(existing.code, Number(existing.cost), payUrl),
              idempotent: true,
            },
          });
          return;
        }
      }

      const stored = await saveBuffer(pdfBytes, file.originalname || req.body?.title || 'document.pdf');
      const savedFile = await AppDataSource.getRepository(File).save(
        AppDataSource.getRepository(File).create({
          tenantId: req.tenant?.id ?? user.tenantId ?? null,
          fileName: file.originalname || req.body?.title || 'document',
          mimeType: file.mimetype || 'application/octet-stream',
          sizeBytes: pdfBytes.length,
          fileURL: stored.url,
          pageCount,
        }),
      );

      const job = jobRepo.create();
      Object.assign(job, {
        userId: user.id,
        tenantId: req.tenant?.id ?? user.tenantId ?? null,
        fileId: savedFile.id,
        fileName: req.body?.title || file.originalname || 'document',
        code: makeCode(6),
        cost,
        totalPages: pageCount,
        jobType: JobType.SINGLE,
        status: PrintJobStatus.PENDING,
        printConfiguration,
        idempotencyKey: idempotencyKey || null,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      const saved = await jobRepo.save(job);

      const payUrl = await initCheckout(user, saved.id, cost, req.tenant);

      const message = cupsStatusMessage(saved.code, cost, payUrl);
      res.json({
        success: true,
        data: {
          code: saved.code,
          cost,
          pages: pageCount,
          copies,
          config: printConfiguration,
          payUrl,
          message,
        },
      });
    } catch (error: any) {
      console.error('CUPS ingress error:', error);
      next(error);
    }
  };
}

export const kioskCupsController = new KioskCupsController();
