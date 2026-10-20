import { type Request, type Response, type NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { IsNull } from 'typeorm';
import { AppDataSource } from '@/config/data-source';
import { PrintJob, PrintJobStatus } from '@/database/entities/printJob.entity';
import { PrintJobItem } from '@/database/entities/printJobItem.entity';
import { File } from '@/database/entities/file.entity';
import { Kiosk } from '@/database/entities/kiosk.entity';
import { loadDocumentBytes, loadStoredObject } from '@/core/utils/fileStore';
import { ensurePdf, extractPages, parsePageRange, toGrayscale, fitToOrientation, UnsupportedDocumentError, billablePages } from '@/modules/public/services/documentConvert.service';
import { PrinterServiceExtensions } from '@/modules/saas/services/printerExtensions.service';
import { JWT_SECRET } from '@/core/utils/jwt';
import { emitTenantEvent } from '@/modules/saas/services/tenantWebhook.service';
import { WebhookEvent } from '@/database/entities/tenantWebhook.entity';

const printerExt = new PrinterServiceExtensions();
const FILE_TOKEN_TTL_SECONDS = 5 * 60;

function buildFileToken(jobId: string, kioskId: string): string {
  return jwt.sign(
    { kind: 'agent-file-download', jobId, kioskId },
    JWT_SECRET,
    { expiresIn: FILE_TOKEN_TTL_SECONDS },
  );
}

function verifyFileToken(
  token: string,
  expectedJobId: string,
): { kioskId: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (
      decoded?.kind !== 'agent-file-download' ||
      decoded?.jobId !== expectedJobId
    ) {
      return null;
    }
    return { kioskId: decoded.kioskId };
  } catch {
    return null;
  }
}

function publicBaseUrl(req: Request): string {
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || '';
  return `${proto}://${host}`;
}

const POLL_IDLE_MS = 10_000;
const POLL_BUSY_MS = 2_000;
const CLAIM_GRACE_MS = 60_000;

function releasableWhere(kiosk: Kiosk) {
  const tenantId = kiosk.tenantId as string;
  return [
    { status: PrintJobStatus.RELEASING, kioskId: kiosk.id, tenantId },
    { status: PrintJobStatus.RELEASING, kioskId: IsNull(), tenantId },
  ];
}

function effectivePages(docTotal: number, cfg: any): number {
  return billablePages(docTotal, cfg);
}

async function serializeJobForKiosk(job: PrintJob, kiosk: Kiosk, base: string) {
  const token = encodeURIComponent(buildFileToken(job.id, kiosk.id));
  let items: Array<{
    fileId: string;
    fileName: string;
    downloadUrl: string;
    printConfiguration: any;
    totalPages: number;
  }>;

  if (job.jobType === 'personal_batch') {
    const rows = await AppDataSource.getRepository(PrintJobItem).find({
      where: { printJobId: job.id },
      order: { order: 'ASC' },
    });
    items = rows.map((it) => ({
      fileId: it.fileId,
      fileName: it.fileName,
      downloadUrl: `${base}/api/agent/jobs/${job.id}/file?item=${encodeURIComponent(it.id)}&t=${token}`,
      printConfiguration: it.printConfiguration,
      totalPages: effectivePages(it.totalPages, it.printConfiguration),
    }));
  } else {
    items = [
      {
        fileId: job.fileId,
        fileName: job.fileName || 'document.pdf',
        downloadUrl: `${base}/api/agent/jobs/${job.id}/file?t=${token}`,
        printConfiguration: job.printConfiguration,
        totalPages: effectivePages(job.totalPages, job.printConfiguration),
      },
    ];
  }
  return {
    id: job.id,
    code: job.code,
    jobType: job.jobType,
    totalPages: job.totalPages,
    updatedAt: job.updatedAt,
    items,
  };
}

export class KioskAgentController {
  listReadyJobs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const kiosk = req.kiosk as Kiosk;
      const jobs = await AppDataSource.getRepository(PrintJob).find({
        where: releasableWhere(kiosk),
        order: { updatedAt: 'ASC' },
        take: 10,
      });
      const base = publicBaseUrl(req);
      const out = await Promise.all(jobs.map((job) => serializeJobForKiosk(job, kiosk, base)));
      res.json({ success: true, data: { jobs: out } });
    } catch (err: any) {
      console.error('[agent] /jobs/ready error:', err?.message);
      next(err);
    }
  };

  poll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const kiosk = req.kiosk as Kiosk;
      const tenantId = kiosk.tenantId as string;
      const repo = AppDataSource.getRepository(PrintJob);
      const inFlight = new Set<string>(req.body?.inFlight ?? []);
      const max: number = req.body?.max ?? 1;

      const held = await repo.find({
        where: { status: PrintJobStatus.PRINTING, kioskId: kiosk.id, tenantId },
        select: { id: true, updatedAt: true },
      });
      const now = Date.now();
      const lost = held
        .filter(
          (j) => !inFlight.has(j.id) && now - new Date(j.updatedAt).getTime() > CLAIM_GRACE_MS,
        )
        .map((j) => j.id);
      if (lost.length) {
        await repo
          .createQueryBuilder()
          .update(PrintJob)
          .set({ status: PrintJobStatus.RELEASING, pagesCompleted: 0 })
          .where('id IN (:...ids) AND status = :printing AND kioskId = :kid AND tenantId = :tid', {
            ids: lost,
            printing: PrintJobStatus.PRINTING,
            kid: kiosk.id,
            tid: tenantId,
          })
          .execute();
        console.warn(`[agent] kiosk ${kiosk.id} lost ${lost.length} claimed job(s); requeued`);
      }
      const heldIds = new Set(held.map((j) => j.id));
      const revoked = [...inFlight].filter((id) => !heldIds.has(id));

      const claimed: PrintJob[] = [];
      if (max > 0) {
        const candidates = await repo.find({
          where: releasableWhere(kiosk),
          order: { updatedAt: 'ASC' },
          take: max,
        });
        for (const job of candidates) {
          const result = await repo
            .createQueryBuilder()
            .update(PrintJob)
            .set({ status: PrintJobStatus.PRINTING, kioskId: kiosk.id, pagesCompleted: 0 })
            .where(
              'id = :id AND status = :releasing AND tenantId = :tid AND (kioskId = :kid OR kioskId IS NULL)',
              { id: job.id, releasing: PrintJobStatus.RELEASING, tid: tenantId, kid: kiosk.id },
            )
            .execute();
          if ((result.affected ?? 0) === 1) {
            job.status = PrintJobStatus.PRINTING;
            job.kioskId = kiosk.id;
            claimed.push(job);
          }
        }
      }

      const [queued, waitingForPickup] = await Promise.all([
        repo.count({ where: releasableWhere(kiosk) }),
        repo.count({ where: { status: PrintJobStatus.READY, tenantId } }),
      ]);

      const base = publicBaseUrl(req);
      const jobs = await Promise.all(claimed.map((job) => serializeJobForKiosk(job, kiosk, base)));
      res.json({
        success: true,
        data: {
          jobs,
          revoked,
          counts: {
            claimed: claimed.length,
            printing: held.length - lost.length + claimed.length,
            queued,
            waitingForPickup,
            requeued: lost.length,
          },
          nextPollMs: queued > 0 ? POLL_BUSY_MS : POLL_IDLE_MS,
        },
      });
    } catch (err: any) {
      console.error('[agent] /poll error:', err?.message);
      next(err);
    }
  };

  progressJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const kiosk = req.kiosk as Kiosk;
      const result = await AppDataSource.getRepository(PrintJob)
        .createQueryBuilder()
        .update(PrintJob)
        .set({ pagesCompleted: req.body.pagesCompleted })
        .where('id = :id AND status = :printing AND kioskId = :kid AND tenantId = :tid', {
          id: req.params.id,
          printing: PrintJobStatus.PRINTING,
          kid: kiosk.id,
          tid: kiosk.tenantId,
        })
        .execute();
      if ((result.affected ?? 0) !== 1) {
        res.status(409).json({
          success: false,
          message: 'Job is not printing on this kiosk',
          code: 'JOB_NOT_HELD',
        });
        return;
      }
      res.json({ success: true });
    } catch (err: any) {
      console.error('[agent] /jobs/:id/progress error:', err?.message);
      next(err);
    }
  };

  downloadJobFile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = String(req.query.t || '');
      const claims = verifyFileToken(token, req.params.id);
      if (!claims) {
        res.status(401).json({ success: false, message: 'Invalid or expired file token' });
        return;
      }

      const printJob = await AppDataSource.getRepository(PrintJob).findOne({
        where: { id: req.params.id },
      });
      if (!printJob) {
        res.status(404).json({ success: false, message: 'Job not found' });
        return;
      }

      if (!req.query.item && printJob.renderedKey) {
        const rawBytes = await loadStoredObject(printJob.renderedKey);
        if (!rawBytes) {
          res.status(502).json({ success: false, message: 'Rendered file not retrievable' });
          return;
        }

        res.setHeader('Content-Type', 'image/pwg-raster');
        res.setHeader('Content-Length', String(rawBytes.length));
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${printJob.id}.pwg"`,
        );
        res.send(rawBytes);
        return;
      }

      let fileId: string | undefined;
      let cfg: any = {};
      if (req.query.item) {
        const item = await AppDataSource.getRepository(PrintJobItem).findOne({
          where: { id: String(req.query.item), printJobId: req.params.id },
        });
        if (!item) {
          res.status(404).json({ success: false, message: 'Item not found' });
          return;
        }
        fileId = item.fileId;
        cfg = item.printConfiguration || {};
      } else {
        fileId = printJob.fileId;
        cfg = printJob.printConfiguration || {};
        (req as any).__tokenJobTenantId = printJob.tenantId;
      }
      const fileTenantId =
        (req as any).__tokenJobTenantId ?? (req as any).kiosk?.tenantId ?? null;
      const file = await AppDataSource.getRepository(File).findOne({
        where: fileTenantId ? { id: fileId, tenantId: fileTenantId } : { id: fileId },
      });
      if (!file?.fileURL) {
        res.status(404).json({ success: false, message: 'File missing' });
        return;
      }
      const rawBytes = await loadDocumentBytes(file.fileURL);
      if (!rawBytes) {
        res.status(502).json({ success: false, message: 'File not retrievable' });
        return;
      }

      let pdfBytes: Buffer;
      try {
        const ensured = await ensurePdf(rawBytes, file.fileName || 'document.pdf');
        pdfBytes = ensured.buffer;
      } catch (e: any) {
        if (e instanceof UnsupportedDocumentError) {
          res.status(415).json({ success: false, message: e.message, code: e.code });
          return;
        }
        console.error('[agent] ensurePdf failed:', e?.message);
        res.status(502).json({ success: false, message: 'Document could not be prepared for printing.' });
        return;
      }

      if (cfg && cfg.pages === 'range' && cfg.pageRange) {
        try {
          const { PDFDocument } = await import('pdf-lib');
          const doc = await PDFDocument.load(pdfBytes, { updateMetadata: false }).catch(() => null);
          const total = doc ? doc.getPageCount() : 0;
          const wanted = parsePageRange(String(cfg.pageRange), total);
          if (wanted.length > 0) {
            pdfBytes = await extractPages(pdfBytes, wanted);
          }
        } catch (e: any) {
          console.warn('[agent] page-range slice failed, sending full document:', e?.message);
        }
      }

      if (cfg && cfg.color && cfg.color !== 'color') {
        pdfBytes = await toGrayscale(pdfBytes);
      }

      if (cfg && (cfg.orientation === 'landscape' || cfg.orientation === 'portrait')) {
        pdfBytes = await fitToOrientation(pdfBytes, cfg.orientation);
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', String(pdfBytes.length));
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${(file.fileName || 'document.pdf').replace(/"/g, '')}.pdf"`,
      );
      res.send(pdfBytes);
    } catch (err: any) {
      console.error('[agent] /jobs/:id/file error:', err?.message);
      next(err);
    }
  };

  startJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const kiosk = req.kiosk as Kiosk;
      const result = await AppDataSource.getRepository(PrintJob)
        .createQueryBuilder()
        .update(PrintJob)
        .set({ status: PrintJobStatus.PRINTING, kioskId: kiosk.id })
        .where('id = :id AND status = :releasing AND tenantId = :tid', {
          id: req.params.id,
          releasing: PrintJobStatus.RELEASING,
          tid: kiosk.tenantId,
        })
        .execute();
      if ((result.affected ?? 0) !== 1) {
        res.status(409).json({
          success: false,
          message: 'Job is no longer claimable (already started or completed)',
        });
        return;
      }
      res.json({ success: true });
    } catch (err: any) {
      console.error('[agent] /jobs/:id/start error:', err?.message);
      next(err);
    }
  };

  completeJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const kiosk = req.kiosk as Kiosk;
      const repo = AppDataSource.getRepository(PrintJob);
      const job = await repo.findOne({
        where: { id: req.params.id, tenantId: kiosk.tenantId as string },
      });
      if (!job) {
        res.status(404).json({ success: false, message: 'Job not found' });
        return;
      }
      if (job.kioskId && job.kioskId !== kiosk.id) {
        res.status(403).json({ success: false, message: 'Job belongs to another kiosk' });
        return;
      }
      if (job.status === PrintJobStatus.DONE) {
        res.json({ success: true, data: { jobId: job.id, completedAt: job.completedAt } });
        return;
      }
      if (job.status !== PrintJobStatus.PRINTING && job.status !== PrintJobStatus.RELEASING) {
        res.status(409).json({
          success: false,
          message: `Job is ${job.status} and cannot be completed`,
          code: 'JOB_NOT_HELD',
        });
        return;
      }

      const VALID_STATES = new Set(['confirmed', 'unconfirmed']);
      const VALID_METHODS = new Set(['ipp-job-state', 'queue-drain', 'none']);
      const confState = String(req.body?.confirmation || '');
      const confMethod = String(req.body?.method || '');
      if (VALID_STATES.has(confState) && VALID_METHODS.has(confMethod)) {
        job.agentConfirmation = `${confMethod}:${confState}`.slice(0, 64);
        await repo.save(job);
        const detail = String(req.body?.detail || '').slice(0, 200);
        console.log(
          `[agent] job ${job.id} confirmation: ${job.agentConfirmation}${detail ? ` — ${detail}` : ''}`,
        );
      }

      const result = await printerExt.completePrintJob({
        code: job.code || '',
        kioskId: kiosk.id,
        kioskName: kiosk.name,
        cost: Number(job.cost) || 0,
        totalPages: job.totalPages || 0,
        tenantId: kiosk.tenantId,
      });
      res.json({ success: true, data: result });
    } catch (err: any) {
      console.error('[agent] /jobs/:id/complete error:', err?.message);
      next(err);
    }
  };

  storeCapabilities = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const kiosk = req.kiosk as Kiosk;
      const body = req.body || {};
      const asTri = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);
      const media = Array.isArray(body.media)
        ? body.media.slice(0, 50).map((m: unknown) => String(m).slice(0, 64))
        : null;

      await AppDataSource.getRepository(Kiosk).update(
        { id: kiosk.id },
        {
          capColor: asTri(body.color),
          capDuplex: asTri(body.duplex),
          capA3: asTri(body.a3),
          capMedia: media ? JSON.stringify(media) : null,
          capUpdatedAt: new Date(),
        },
      );
      console.log(
        `[agent] kiosk ${kiosk.id} capabilities: colour=${asTri(body.color)} duplex=${asTri(
          body.duplex,
        )} a3=${asTri(body.a3)}`,
      );
      res.json({ success: true });
    } catch (err: any) {
      console.error('[agent] /printer/capabilities error:', err?.message);
      next(err);
    }
  };

  failedJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const kiosk = req.kiosk as Kiosk;
      const reason = String(req.body?.reason || 'agent reported failure').slice(0, 280);
      const retryable = req.body?.retryable === true;
      const repo = AppDataSource.getRepository(PrintJob);
      const result = await repo
        .createQueryBuilder()
        .update(PrintJob)
        .set(
          retryable
            ? { status: PrintJobStatus.RELEASING, kioskId: null as any, pagesCompleted: 0 }
            : { status: PrintJobStatus.FAILED },
        )
        .where(
          'id = :id AND tenantId = :tid AND (kioskId = :kid OR kioskId IS NULL) AND status IN (:...live)',
          {
            tid: kiosk.tenantId,
            id: req.params.id,
            kid: kiosk.id,
            live: [PrintJobStatus.PRINTING, PrintJobStatus.RELEASING],
          },
        )
        .execute();
      if ((result.affected ?? 0) !== 1) {
        res.status(404).json({ success: false, message: 'Job not found or claimed by another kiosk' });
        return;
      }
      if (retryable) {
        console.warn(`[agent] job ${req.params.id} requeued by kiosk ${kiosk.id}: ${reason}`);
        res.json({ success: true, data: { requeued: true } });
        return;
      }
      console.error(`[agent] job ${req.params.id} FAILED: ${reason}`);
      if (kiosk.tenantId) {
        emitTenantEvent(kiosk.tenantId, WebhookEvent.JOB_FAILED, {
          printJobId: req.params.id,
          reason,
          kioskId: kiosk.id,
          source: 'agent',
        });
      }
      res.json({ success: true });
    } catch (err: any) {
      console.error('[agent] /jobs/:id/failed error:', err?.message);
      next(err);
    }
  };
}

export const kioskAgentController = new KioskAgentController();
