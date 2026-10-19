import crypto from 'node:crypto';
import { type Request, type Response, type NextFunction } from 'express';
import { LEGACY_TENANT_SLUG } from '@/common/middleware/tenant.middleware';
import multer from 'multer';
import { AppDataSource } from '@/config/data-source';
import { PrintJob, PrintJobStatus, JobType } from '@/database/entities/printJob.entity';
import { File } from '@/database/entities/file.entity';
import { PrintJobItem } from '@/database/entities/printJobItem.entity';
import { User } from '@/database/entities/user.entity';
import { DocumentEdit, DocumentEditStatus } from '@/database/entities/documentEdit.entity';
import { EditPricingConfig } from '@/database/entities/editPricingConfig.entity';
import { saveBuffer } from '@/core/utils/fileStore';
import {
  isPrintableDocument,
  countPages,
  flattenAnnotations,
  UnsupportedDocumentError,
} from '@/modules/public/services/documentConvert.service';
import {
  isOfficeDocument,
  conversionEnabled,
  convertOfficeToPdf,
  acceptedDocsLabel,
  OfficeConversionError,
} from '@/modules/public/services/documentConversion.service';
import { getUploadLimits } from '@/core/utils/limits';
import { applyPromotion } from '@/modules/customer/services/promotion.service';
import { computeCost, type PrintConfiguration } from '@/modules/public/services/pricing.service';
import { checkUploadLimit, validateFileSize } from '@/modules/customer/services/abuseLimits.service';
import { PricingConfig } from '@/database/entities/pricingConfig.entity';
import { Kiosk, KioskStatus } from '@/database/entities/kiosk.entity';
import { Tenant } from '@/database/entities/tenant.entity';
import { ShopReview } from '@/database/entities/shopReview.entity';
import { Dispute, DisputeStatus } from '@/database/entities/dispute.entity';
import { Payment } from '@/database/entities/payment.entity';

function formatJob(j: PrintJob) {
  const title = (j.fileName || 'Document').replace(/\.[^.]+$/, '');
  const cfg: any = j.printConfiguration || {};
  return {
    id: j.id,
    fileName: j.fileName,
    title,
    code: j.code,
    cost: Number(j.cost),
    finalCost: j.finalCost == null ? null : Number(j.finalCost),
    shortfall: j.finalCost == null ? 0 : Math.max(0, Number(j.finalCost) - Number(j.cost)),
    status: j.status,
    jobType: j.jobType,
    pageCount: j.totalPages,
    printConfiguration: cfg,
    createdAt: j.createdAt,
    expiresAt: j.expiresAt,
    qrPayload: `printloop://release/${j.code}`,
    meta: `${j.totalPages}pp · ${cfg.paper || 'A4'} · ${cfg.color === 'color' ? 'Colour' : 'B&W'} · ${cfg.qualityDpi || 300}dpi`,
  };
}

async function assertTenantHasOnlineKiosk(req: Request): Promise<string | null> {
  const t = req.tenant;
  if (!t) return null;
  if (t.slug === LEGACY_TENANT_SLUG) return null;

  if (t.availability === 'closed') {
    return 'This shop is currently closed. Check back soon or try another nearby shop.';
  }

  const kiosks = await AppDataSource.getRepository(Kiosk).find({
    where: { tenantId: t.id },
  });
  const cutoff = Date.now() - 5 * 60 * 1000;
  const online = kiosks.some(
    (k) =>
      k.status === KioskStatus.ACTIVE &&
      (process.env.SEED_DEMO === '1' ||
        process.env.NODE_ENV !== 'production' ||
        (k.lastSeenAt && new Date(k.lastSeenAt).getTime() > cutoff)),
  );
  if (online) return null;
  return 'This shop just went offline. Try another nearby shop or wait a few minutes.';
}

export class CustomerPrintController {

  createPrintJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = (req as any).user;
    const file = req.file;
    if (!file) {
      res.status(400).json({ success: false, message: 'A document file is required' });
      return;
    }
    const offlineReason = await assertTenantHasOnlineKiosk(req);
    if (offlineReason) {
      res.status(409).json({
        success: false,
        message: offlineReason,
        code: 'SHOP_OFFLINE',
      });
      return;
    }
    const isOffice =
      conversionEnabled() && isOfficeDocument(file.originalname || '', file.mimetype);
    if (!isPrintableDocument(file.originalname || '', file.mimetype) && !isOffice) {
      res.status(415).json({
        success: false,
        message: `Unsupported file type. PrintLoop prints ${acceptedDocsLabel()} only.`,
        code: 'UNSUPPORTED_DOCUMENT',
      });
      return;
    }

    let cfg: any = {};
    try {
      cfg = req.body.printConfiguration ? JSON.parse(req.body.printConfiguration) : {};
    } catch {
      cfg = {};
    }
    const printConfiguration: PrintConfiguration = {
      copies: Math.max(1, Number(cfg.copies) || 1),
      paper: cfg.paper || 'A4',
      color: cfg.color === 'color' ? 'color' : 'bw',
      sided: cfg.sided === 'double' ? 'double' : 'single',
      qualityDpi: ([100, 300, 600].includes(Number(cfg.qualityDpi))
        ? Number(cfg.qualityDpi)
        : 300) as 100 | 300 | 600,
      orientation: cfg.orientation === 'landscape' ? 'landscape' : 'portrait',
    };
    const limits = await getUploadLimits();
    const sizeCheck = validateFileSize(file.size);
    if (!sizeCheck.valid) {
      res.status(413).json({
        success: false,
        message: sizeCheck.message,
        code: 'FILE_TOO_LARGE',
      });
      return;
    }
    if (req.tenant?.id) {
      const uploadLimit = await checkUploadLimit(req.tenant.id, file.size);
      if (!uploadLimit.allowed) {
        res.status(429).json({
          success: false,
          message: `Upload limit exceeded. You've used ${(uploadLimit.usedBytes / 1024 / 1024 / 1024).toFixed(2)} GB of ${(uploadLimit.limitBytes / 1024 / 1024 / 1024).toFixed(0)} GB daily allowance. Resets at midnight UTC.`,
          code: 'UPLOAD_LIMIT_EXCEEDED',
          retryAfter: Math.ceil((uploadLimit.resetAt.getTime() - Date.now()) / 1000),
        });
        return;
      }
    }
    if (file.size > limits.maxFileBytes) {
      res.status(413).json({
        success: false,
        message: `File too large. Max ${Math.round(limits.maxFileBytes / 1048576)} MB.`,
        code: 'FILE_TOO_LARGE',
      });
      return;
    }
    let sourceBytes = file.buffer;
    if (isOffice) {
      try {
        sourceBytes = await convertOfficeToPdf(file.buffer, file.originalname || 'document');
      } catch (e: any) {
        res.status(e instanceof OfficeConversionError ? 422 : 500).json({
          success: false,
          message: 'We could not convert that document. Please upload a PDF, or try again.',
          code: 'OFFICE_CONVERSION_FAILED',
        });
        return;
      }
    }
    const pdfBytes = await flattenAnnotations(sourceBytes);
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
    const jobType =
      req.body.jobType === 'personal_batch' ? JobType.PERSONAL_BATCH : JobType.SINGLE;
    const editingRequired = req.body.editingRequired === 'true' || req.body.editingRequired === true;
    const editingInstructions = req.body.editingInstructions?.trim() || null;

    const baseCost = await computeCost({
      pageCount,
      copies: printConfiguration.copies,
      paper: printConfiguration.paper,
      color: printConfiguration.color,
      sided: printConfiguration.sided,
      qualityDpi: printConfiguration.qualityDpi,
    });
    const promo = await applyPromotion(baseCost, req.body.promotionCode, {
      pageCount,
      perPageBw: 5,
    });
    const cost = promo.cost;

    const stored = await saveBuffer(pdfBytes, file.originalname || req.body.fileName || 'document.pdf');
    const savedFile = await AppDataSource.getRepository(File).save(
      AppDataSource.getRepository(File).create({
        tenantId: req.tenant?.id ?? null,
        fileName: file.originalname || 'document',
        mimeType: file.mimetype || 'application/octet-stream',
        sizeBytes: pdfBytes.length,
        fileURL: stored.url,
        pageCount,
      })
    );

    const jobRepo = AppDataSource.getRepository(PrintJob);
    const job = jobRepo.create();
    Object.assign(job, {
      userId: user.id,
      tenantId: req.tenant?.id ?? null,
      fileId: savedFile.id,
      fileName: file.originalname || 'document',
      code: null,
      cost,
      totalPages: pageCount,
      jobType,
      editingRequired,
      editingInstructions,
      status: editingRequired ? PrintJobStatus.AWAITING_EDIT : PrintJobStatus.PENDING,
      printConfiguration,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    const saved = await jobRepo.save(job);

    if (editingRequired && req.tenant?.id) {
      try {
        const editPricingRepo = AppDataSource.getRepository(EditPricingConfig);
        const editPricing = await editPricingRepo.findOne({ where: { tenantId: req.tenant.id } });

        if (editPricing?.editingEnabled) {
          const editRepo = AppDataSource.getRepository(DocumentEdit);
          const edit = editRepo.create({
            printJobId: saved.id,
            shopId: req.tenant.id,
            editedBy: '', // Will be set when shop starts editing
            editOperations: [],
            originalDocumentMeta: {
              pageCount,
              fileSize: pdfBytes.length,
              fileName: file.originalname || 'document',
            },
            editedDocumentMeta: null,
            baseEditFee: Number(editPricing.baseFee),
            perPageFee: Number(editPricing.perPageFee),
            complexityFee: 0,
            shopAdjustedFee: 0,
            totalEditFee: Number(editPricing.baseFee) + Number(editPricing.perPageFee) * pageCount,
            status: DocumentEditStatus.PENDING_SHOP,
            shopNotes: null,
            customerRejectionReason: null,
            approvedBy: null,
            approvedAt: null,
            completedAt: null,
          });
          await editRepo.save(edit);

          const { notificationQueue } = await import('@/workers/queues');
          await notificationQueue.add('new-edit-job', {
            shopId: req.tenant.id,
            printJobId: saved.id,
            editId: edit.id,
            customerName: `${user.firstName} ${user.lastName}`,
            customerEmail: user.email,
          });
        }
      } catch (editErr) {
        console.error('Failed to create edit job:', editErr);
      }
    }

    res.status(201).json({
      success: true,
      data: { job: formatJob(saved) },
    });
  } catch (error) {
    console.error('Customer create print job error:', error);
    res.status(500).json({ success: false, message: 'Failed to create print job' });
  }
};

  createPrintJobBatch = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = (req as any).user;
    const files = (req.files as Express.Multer.File[]) || [];
    if (!files.length) {
      res.status(400).json({ success: false, message: 'At least one document is required' });
      return;
    }
    const offlineReason = await assertTenantHasOnlineKiosk(req);
    if (offlineReason) {
      res.status(409).json({
        success: false,
        message: offlineReason,
        code: 'SHOP_OFFLINE',
      });
      return;
    }
    const officeOk = conversionEnabled();
    const bad = files.find(
      (f) =>
        !isPrintableDocument(f.originalname || '', f.mimetype) &&
        !(officeOk && isOfficeDocument(f.originalname || '', f.mimetype)),
    );
    if (bad) {
      res.status(415).json({
        success: false,
        message: `"${bad.originalname}" is not supported. PrintLoop prints ${acceptedDocsLabel()} only.`,
        code: 'UNSUPPORTED_DOCUMENT',
      });
      return;
    }
    let items: any[] = [];
    try {
      items = req.body.items ? JSON.parse(req.body.items) : [];
    } catch {
      items = [];
    }
    const collate = req.body.collate !== 'false';

    const limits = await getUploadLimits();
    const perFile: Array<{ pages: number; bytes: Buffer }> = [];
    for (const f of files) {
      if (f.size > limits.maxFileBytes) {
        res.status(413).json({
          success: false,
          message: `"${f.originalname}" is too large. Max ${Math.round(limits.maxFileBytes / 1048576)} MB.`,
          code: 'FILE_TOO_LARGE',
        });
        return;
      }
      let src = f.buffer;
      if (officeOk && isOfficeDocument(f.originalname || '', f.mimetype)) {
        try {
          src = await convertOfficeToPdf(f.buffer, f.originalname || 'document');
        } catch (e: any) {
          res.status(e instanceof OfficeConversionError ? 422 : 500).json({
            success: false,
            message: `We could not convert "${f.originalname}". Please upload a PDF, or try again.`,
            code: 'OFFICE_CONVERSION_FAILED',
          });
          return;
        }
      }
      const bytes = await flattenAnnotations(src);
      let pages: number;
      try {
        pages = await countPages(bytes, f.originalname || 'document.pdf');
      } catch (e: any) {
        res.status(e instanceof UnsupportedDocumentError ? 415 : 422).json({
          success: false,
          message: `"${f.originalname}": ${e?.message || 'Could not read the document.'}`,
          code: e?.code || 'UNREADABLE_DOCUMENT',
        });
        return;
      }
      if (pages > limits.maxPages) {
        res.status(413).json({
          success: false,
          message: `"${f.originalname}" has ${pages} pages; the limit is ${limits.maxPages}.`,
          code: 'TOO_MANY_PAGES',
        });
        return;
      }
      perFile.push({ pages, bytes });
    }

    const fileRepo = AppDataSource.getRepository(File);
    const itemRepo = AppDataSource.getRepository(PrintJobItem);
    const jobRepo = AppDataSource.getRepository(PrintJob);

    const job = jobRepo.create();
    Object.assign(job, {
      userId: user.id,
      tenantId: req.tenant?.id ?? null,
      fileId: null,
      fileName: `${files.length} document${files.length === 1 ? '' : 's'} (batch)`,
      code: null,
      cost: 0,
      totalPages: 0,
      jobType: JobType.PERSONAL_BATCH,
      status: PrintJobStatus.PENDING,
      printConfiguration: { collate } as any,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    const savedJob = await jobRepo.save(job);

    let totalCost = 0;
    let totalPages = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const meta = items[i] || {};
      const cfg = {
        copies: Math.max(1, Number(meta.printConfiguration?.copies) || 1),
        paper: meta.printConfiguration?.paper || 'A4',
        color: (meta.printConfiguration?.color === 'color' ? 'color' : 'bw') as 'bw' | 'color',
        sided: (meta.printConfiguration?.sided === 'double' ? 'double' : 'single') as
          | 'single'
          | 'double',
        qualityDpi: ([100, 300, 600].includes(Number(meta.printConfiguration?.qualityDpi))
          ? Number(meta.printConfiguration?.qualityDpi)
          : 300) as 100 | 300 | 600,
        orientation: (meta.printConfiguration?.orientation === 'landscape'
          ? 'landscape'
          : 'portrait') as 'portrait' | 'landscape',
      };
      const pages = perFile[i].pages; // authoritative (server-derived)
      const bytes = perFile[i].bytes; // flattened in the validation pass
      const cost = await computeCost({ pageCount: pages, ...cfg });
      totalCost += cost;
      totalPages += pages;

      const stored = await saveBuffer(bytes, f.originalname || meta.fileName || `doc-${i + 1}.pdf`);
      const savedFile = await fileRepo.save(
        fileRepo.create({
          tenantId: req.tenant?.id ?? null,
          fileName: f.originalname || `doc-${i + 1}`,
          mimeType: f.mimetype || 'application/octet-stream',
          sizeBytes: bytes.length,
          fileURL: stored.url,
          pageCount: pages,
        })
      );
      const it = itemRepo.create();
      Object.assign(it, {
        printJobId: savedJob.id,
        tenantId: req.tenant?.id ?? null,
        fileId: savedFile.id,
        fileName: f.originalname || `doc-${i + 1}`,
        order: i,
        totalPages: pages,
        cost,
        printConfiguration: cfg,
      });
      await itemRepo.save(it);
    }

    const promo = await applyPromotion(totalCost, req.body.promotionCode, {
      pageCount: totalPages,
      perPageBw: 5,
    });
    savedJob.cost = promo.cost;
    savedJob.totalPages = totalPages;
    await jobRepo.save(savedJob);

    res.status(201).json({
      success: true,
      data: { job: { ...formatJob(savedJob), items: files.length } },
    });
  } catch (error) {
    console.error('Customer batch job error:', error);
    res.status(500).json({ success: false, message: 'Failed to create batch job' });
  }
};

  listPrintJobs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = (req as any).user;
    const status = req.query.status?.toString();
    const where: any = { userId: user.id };
    if (req.tenant) where.tenantId = req.tenant.id;
    const [jobs, tenants] = await Promise.all([
      AppDataSource.getRepository(PrintJob).find({
        where,
        order: { createdAt: 'DESC' },
        take: 100,
      }),
      AppDataSource.getRepository(Tenant).find({
        select: ['id', 'slug', 'name'],
      }),
    ]);

    const tenantMap = new Map<string, { slug: string; name: string }>();
    for (const t of tenants) {
      tenantMap.set(t.id, { slug: t.slug, name: t.name });
    }

    const mapped = jobs
      .map((j) => {
        const base = formatJob(j);
        const tInfo = j.tenantId ? tenantMap.get(j.tenantId) : null;
        return {
          ...base,
          tenantId: j.tenantId,
          tenantSlug: tInfo?.slug || null,
          tenantName: tInfo?.name || null,
        };
      })
      .filter((j) => !status || status === 'all' || j.status === status);
    res.json({ success: true, data: { jobs: mapped, total: mapped.length } });
  } catch (error) {
    console.error('Customer list jobs error:', error);
    res.status(500).json({ success: false, message: 'Failed to list jobs' });
  }
};

  getPrintToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = (req as any).user;
    const fresh = await AppDataSource.getRepository(User).findOne({
      where: { id: user.id },
      select: ['id', 'printToken'],
    });
    res.json({
      success: true,
      data: { hasToken: !!fresh?.printToken, token: fresh?.printToken || null },
    });
  } catch (err) {
    console.error('Print-token read error:', err);
    res.status(500).json({ success: false, message: 'Failed to read print token' });
  }
};

  rotatePrintToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = (req as any).user;
    const repo = AppDataSource.getRepository(User);
    const token = crypto.randomBytes(40).toString('hex'); // 80 chars hex
    await repo.update({ id: user.id }, { printToken: token });
    res.json({ success: true, data: { token } });
  } catch (err) {
    console.error('Print-token rotate error:', err);
    res.status(500).json({ success: false, message: 'Failed to rotate print token' });
  }
};

  getPricing = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rows = await AppDataSource.getRepository(PricingConfig).find({
      where: { isActive: true },
    });
    res.json({
      success: true,
      data: {
        currency: 'NGN',
        floor: 5,
        officeConversion: conversionEnabled(),
        configs: rows.map((r) => ({
          paperSize: r.paperSize,
          colorType: r.colorType,
          pricePerPage: Number(r.pricePerPage),
          duplexMultiplier: Number(r.duplexMultiplier),
          highResolutionMultiplier: Number(r.highResolutionMultiplier),
          price100Simplex: r.price100Simplex == null ? null : Number(r.price100Simplex),
          price300Simplex: r.price300Simplex == null ? null : Number(r.price300Simplex),
          price600Simplex: r.price600Simplex == null ? null : Number(r.price600Simplex),
          price100Duplex: r.price100Duplex == null ? null : Number(r.price100Duplex),
          price300Duplex: r.price300Duplex == null ? null : Number(r.price300Duplex),
          price600Duplex: r.price600Duplex == null ? null : Number(r.price600Duplex),
        })),
      },
    });
  } catch (err) {
    console.error('Customer pricing read error:', err);
    res.status(500).json({ success: false, message: 'Failed to read pricing' });
  }
};

  quotePrintJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const b = req.body || {};
    const pageCount = Math.max(1, Number(b.pageCount) || 1);
    const copies = Math.max(1, Number(b.copies) || 1);
    const paper = b.paper || 'A4';
    const color: 'bw' | 'color' = b.color === 'color' ? 'color' : 'bw';
    const sided: 'single' | 'double' = b.sided === 'double' ? 'double' : 'single';
    const qualityDpi: 100 | 300 | 600 = [100, 300, 600].includes(Number(b.qualityDpi))
      ? (Number(b.qualityDpi) as 100 | 300 | 600)
      : 300;
    const baseCost = await computeCost({ pageCount, copies, paper, color, sided, qualityDpi });
    const promo = await applyPromotion(baseCost, b.promotionCode, {
      pageCount,
      perPageBw: 5,
    });
    res.json({
      success: true,
      data: {
        baseCost,
        cost: promo.cost,
        discount: promo.discount,
        promoCode: promo.code || null,
        promoReason: promo.reason || null,
        config: { paper, color, sided, qualityDpi, copies },
        pageCount,
      },
    });
  } catch (err) {
    console.error('Quote error:', err);
    res.status(500).json({ success: false, message: 'Failed to compute quote' });
  }
};

  listStations = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rows = await AppDataSource.getRepository(Kiosk).find({
      where: { isPublic: true },
      order: { name: 'ASC' },
    });
    const now = Date.now();
    const fiveMin = 5 * 60 * 1000;
    res.json({
      success: true,
      data: {
        stations: rows.map((k) => {
          const fresh = k.lastSeenAt && now - new Date(k.lastSeenAt).getTime() < fiveMin;
          const status =
            k.status === KioskStatus.ACTIVE && fresh
              ? 'online'
              : k.status === KioskStatus.MAINTENANCE
                ? 'maintenance'
                : 'offline';
          return {
            id: k.id,
            name: k.name,
            area: k.location || k.campus || '',
            campus: k.campus || null,
            status,
            mapsUrl: k.mapsUrl || null,
            queue: 0, // populated by a future per-kiosk queue endpoint
            lastSeenAt: k.lastSeenAt,
          };
        }),
      },
    });
  } catch (err) {
    console.error('Customer stations read error:', err);
    res.status(500).json({ success: false, message: 'Failed to read stations' });
  }
};

  getPrintJobOptions = (_req: Request, res: Response, _next: NextFunction): void => {
  res.json({
    success: true,
    data: {
      paperSizes: ['A4', 'A3', 'Letter'],
      colors: ['bw', 'color'],
      sides: ['single', 'double'],
      qualityOptions: [100, 300, 600],
      paymentMethods: ['paystack'],
    },
  });
};

  createShopReview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = (req as any).user;
    const slug = String(req.params.slug || '').trim().toLowerCase();
    const { rating, comment, photoUrl } = req.body || {};

    if (typeof rating !== 'number' || rating < 1 || rating > 5 || !Number.isInteger(rating)) {
      res.status(400).json({
        success: false,
        message: 'Rating must be an integer between 1 and 5 stars.',
      });
      return;
    }

    const tenantRepo = AppDataSource.getRepository(Tenant);
    const tenant = await tenantRepo.findOne({ where: { slug } });
    if (!tenant) {
      res.status(404).json({ success: false, message: 'Shop not found.' });
      return;
    }

    const reviewRepo = AppDataSource.getRepository(ShopReview);
    let review = await reviewRepo.findOne({
      where: { tenantId: tenant.id, userId: user.id },
    });

    if (review) {
      review.rating = rating;
      review.comment = comment === undefined ? review.comment : (comment || null);
      review.photoUrl = photoUrl === undefined ? review.photoUrl : (photoUrl || null);
    } else {
      review = reviewRepo.create({
        tenantId: tenant.id,
        userId: user.id,
        rating,
        comment: comment || null,
        photoUrl: photoUrl || null,
      });
    }

    const saved = await reviewRepo.save(review);
    res.status(201).json({ success: true, data: saved });
  } catch (error: any) {
    console.error('Submit review error:', error);
    res.status(500).json({ success: false, message: error?.message || 'Failed to submit review.' });
  }
};

  createDispute = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = (req as any).user;
    const { printJobId, reason } = req.body || {};

    if (!printJobId || !reason) {
      res.status(400).json({ success: false, message: 'printJobId and reason are required.' });
      return;
    }

    const jobRepo = AppDataSource.getRepository(PrintJob);
    const job = await jobRepo.findOne({
      where: { id: printJobId, userId: user.id },
    });

    if (!job) {
      res.status(404).json({ success: false, message: 'Print job not found.' });
      return;
    }

    const disputeRepo = AppDataSource.getRepository(Dispute);
    const existing = await disputeRepo.findOne({
      where: { printJobId },
    });

    if (existing) {
      res.status(409).json({ success: false, message: 'A dispute has already been filed for this print job.' });
      return;
    }

    const dispute = disputeRepo.create({
      tenantId: job.tenantId!,
      userId: user.id,
      printJobId,
      reason,
      status: DisputeStatus.PENDING,
    });

    const saved = await disputeRepo.save(dispute);
    res.status(201).json({ success: true, data: saved });
  } catch (error: any) {
    console.error('Submit dispute error:', error);
    res.status(500).json({ success: false, message: error?.message || 'Failed to submit dispute.' });
  }
};

}

export const customerPrintController = new CustomerPrintController();
