import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '@/config/data-source';
import { PrintJob, PrintJobStatus } from '@/database/entities/printJob.entity';
import { Kiosk, KioskStatus } from '@/database/entities/kiosk.entity';
import { WebhookEvent } from '@/database/entities/tenantWebhook.entity';
import { emitTenantEvent } from '@/modules/saas/services/tenantWebhook.service';
import { acceptJob } from '@/modules/customer/services/acceptWindow.service';
import { releaseJobToKiosk } from '@/modules/kiosk/services/release.service';
import { printDispatchMode } from '@/modules/saas/services/printPolicy.service';
import { writeAudit } from '@/core/services/audit.service';

const LIVE_STATUSES = [
  PrintJobStatus.PENDING,
  PrintJobStatus.RENDERING,
  PrintJobStatus.AWAITING_ACCEPT,
  PrintJobStatus.READY,
  PrintJobStatus.RELEASING,
  PrintJobStatus.PRINTING,
  PrintJobStatus.FAILED,
];

function serialize(j: PrintJob) {
  return {
    id: j.id,
    code: j.code,
    fileName: j.fileName,
    jobType: j.jobType,
    status: j.status,
    totalPages: j.totalPages,
    pagesCompleted: j.pagesCompleted,
    cost: Number(j.cost),
    finalCost: j.finalCost == null ? null : Number(j.finalCost),
    paymentReference: j.paymentReference,
    printConfiguration: j.printConfiguration,
    previewImageUrls: j.previewImageUrls,
    kioskId: j.kioskId,
    createdAt: j.createdAt,
    updatedAt: j.updatedAt,
    completedAt: j.completedAt,
    user: j.user ? { firstName: j.user.firstName, lastName: j.user.lastName } : null,
  };
}

async function transition(
  tenantId: string,
  id: string,
  from: PrintJobStatus[],
  set: Partial<PrintJob>,
): Promise<boolean> {
  const result = await AppDataSource.getRepository(PrintJob)
    .createQueryBuilder()
    .update(PrintJob)
    .set(set as any)
    .where('id = :id AND tenantId = :tid AND status IN (:...from)', { id, tid: tenantId, from })
    .execute();
  return (result.affected ?? 0) === 1;
}

function conflict(res: Response, message: string) {
  res.status(409).json({ success: false, message, code: 'JOB_STATE_CONFLICT' });
}

export class ShopJobsController {
  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.tenant!.id;
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 60));
      const known = Object.values(PrintJobStatus) as string[];
      const statuses = String(req.query.status || '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => known.includes(s));
      const search = String(req.query.search || '').trim().slice(0, 64);

      const qb = AppDataSource.getRepository(PrintJob)
        .createQueryBuilder('j')
        .leftJoinAndSelect('j.user', 'u')
        .where('j.tenantId = :tid', { tid: tenantId });
      if (statuses.length) {
        qb.andWhere('j.status IN (:...statuses)', { statuses });
      } else {
        qb.andWhere('j.status IN (:...live)', { live: LIVE_STATUSES });
      }
      if (search) {
        qb.andWhere('(UPPER(j.code) LIKE :q OR LOWER(j.fileName) LIKE :ql)', {
          q: `%${search.toUpperCase()}%`,
          ql: `%${search.toLowerCase()}%`,
        });
      }
      const [rows, total] = await qb
        .orderBy('j.updatedAt', 'DESC')
        .skip((page - 1) * limit)
        .take(limit)
        .getManyAndCount();
      res.json({ success: true, data: { jobs: rows.map(serialize), total, page, limit } });
    } catch (err) {
      next(err);
    }
  };

  accept = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const job = await AppDataSource.getRepository(PrintJob).findOne({
        where: { id: req.params.id, tenantId: req.tenant!.id },
      });
      if (!job) {
        res.status(404).json({ success: false, message: 'Job not found' });
        return;
      }
      const result = await acceptJob(job.id);
      if (!result.accepted) return conflict(res, `Job can't be accepted (${result.reason})`);
      await writeAudit(req, 'job.accepted', `job:${job.id}`, { code: job.code });
      res.json({ success: true, data: { status: PrintJobStatus.READY } });
    } catch (err) {
      next(err);
    }
  };

  release = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.tenant!.id;
      const kiosk = await AppDataSource.getRepository(Kiosk).findOne({
        where: { tenantId, status: KioskStatus.ACTIVE },
        order: { lastSeenAt: 'DESC' },
      });
      if ((await printDispatchMode()) !== 'kiosk-pull') {
        return conflict(res, 'Releasing from the console needs kiosk-pull dispatch mode');
      }
      const job = await AppDataSource.getRepository(PrintJob).findOne({ where: { id: req.params.id, tenantId } });
      if (!job) {
        res.status(404).json({ success: false, message: 'Job not found' });
        return;
      }
      const result = await releaseJobToKiosk(job, kiosk?.id ?? null);
      if (!result.ok) {
        res.status(result.status).json({ success: false, message: result.message, code: result.code, amountDue: result.amountDue });
        return;
      }
      await writeAudit(req, 'job.released', `job:${job.id}`, { code: job.code, kioskId: kiosk?.id ?? null });
      res.json({ success: true, data: { status: PrintJobStatus.RELEASING, kioskId: kiosk?.id ?? null } });
    } catch (err) {
      next(err);
    }
  };

  requeue = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.tenant!.id;
      const job = await AppDataSource.getRepository(PrintJob).findOne({
        where: { id: req.params.id, tenantId },
      });
      if (!job) {
        res.status(404).json({ success: false, message: 'Job not found' });
        return;
      }
      if (!job.paymentReference) return conflict(res, 'This job was never paid, so it cannot be requeued');
      const ok = await transition(tenantId, job.id, [PrintJobStatus.FAILED], {
        status: PrintJobStatus.READY,
        kioskId: null as any,
        pagesCompleted: 0,
      });
      if (!ok) return conflict(res, 'Only failed jobs can be requeued');
      await writeAudit(req, 'job.requeued', `job:${job.id}`, { code: job.code });
      res.json({ success: true, data: { status: PrintJobStatus.READY } });
    } catch (err) {
      next(err);
    }
  };

  setStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.body?.status !== PrintJobStatus.DONE) {
        res.status(400).json({ success: false, message: 'Only status "done" can be set here' });
        return;
      }
      const tenantId = req.tenant!.id;
      const completedAt = new Date();
      const ok = await transition(
        tenantId,
        req.params.id,
        [PrintJobStatus.READY, PrintJobStatus.RELEASING, PrintJobStatus.PRINTING],
        { status: PrintJobStatus.DONE, completedAt },
      );
      if (!ok) return conflict(res, 'Only ready or printing jobs can be marked collected');
      await writeAudit(req, 'job.collected', `job:${req.params.id}`, {});
      const job = await AppDataSource.getRepository(PrintJob).findOne({ where: { id: req.params.id } });
      emitTenantEvent(tenantId, WebhookEvent.JOB_COMPLETED, {
        printJobId: req.params.id,
        code: job?.code,
        cost: Number(job?.cost ?? 0),
        totalPages: job?.totalPages,
        completedAt,
        source: 'operator',
      });
      res.json({ success: true, data: { status: PrintJobStatus.DONE } });
    } catch (err) {
      next(err);
    }
  };
}

export const shopJobsController = new ShopJobsController();
