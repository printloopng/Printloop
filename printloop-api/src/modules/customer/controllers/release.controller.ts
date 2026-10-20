import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '@/config/data-source';
import { PrintJob, PrintJobStatus } from '@/database/entities/printJob.entity';
import { Kiosk, KioskStatus } from '@/database/entities/kiosk.entity';
import { releaseJobToKiosk } from '@/modules/kiosk/services/release.service';
import { printDispatchMode } from '@/modules/saas/services/printPolicy.service';

const ONLINE_WINDOW_MS = 2 * 60 * 1000;

async function ownJob(req: Request): Promise<PrintJob | null> {
  return AppDataSource.getRepository(PrintJob).findOne({
    where: { id: req.params.id, userId: (req as any).user.id },
  });
}

export class CustomerReleaseController {
  kiosksForJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const job = await ownJob(req);
      if (!job) {
        res.status(404).json({ success: false, message: 'Job not found' });
        return;
      }
      const kiosks = await AppDataSource.getRepository(Kiosk).find({
        where: { tenantId: job.tenantId as string, status: KioskStatus.ACTIVE },
        order: { name: 'ASC' },
      });
      const now = Date.now();
      res.json({
        success: true,
        data: {
          kiosks: kiosks.map((k) => ({
            id: k.id,
            name: k.name,
            location: k.location,
            online: Boolean(k.lastSeenAt && now - new Date(k.lastSeenAt).getTime() < ONLINE_WINDOW_MS),
          })),
        },
      });
    } catch (err) {
      next(err);
    }
  };

  release = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if ((await printDispatchMode()) !== 'kiosk-pull') {
        res.status(409).json({ success: false, message: 'Enter your code on the kiosk screen to print.', code: 'RELEASE_AT_KIOSK' });
        return;
      }
      const job = await ownJob(req);
      if (!job) {
        res.status(404).json({ success: false, message: 'Job not found' });
        return;
      }
      const kioskId = String(req.body?.kioskId || '');
      const kiosk = kioskId
        ? await AppDataSource.getRepository(Kiosk).findOne({ where: { id: kioskId } })
        : null;
      if (!kiosk || kiosk.tenantId !== job.tenantId || kiosk.status !== KioskStatus.ACTIVE) {
        res.status(400).json({
          success: false,
          message: 'Choose a printer at the shop where this job was paid for.',
          code: 'KIOSK_NOT_AT_SHOP',
        });
        return;
      }
      const result = await releaseJobToKiosk(job, kiosk.id);
      if (!result.ok) {
        res.status(result.status).json({ success: false, message: result.message, code: result.code, amountDue: result.amountDue });
        return;
      }
      res.json({
        success: true,
        message: `Sent to ${kiosk.name}. Your pages will print in a moment.`,
        data: { status: PrintJobStatus.RELEASING, kioskId: kiosk.id, kioskName: kiosk.name },
      });
    } catch (err) {
      next(err);
    }
  };
}

export const customerReleaseController = new CustomerReleaseController();
