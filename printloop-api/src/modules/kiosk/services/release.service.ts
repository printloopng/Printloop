import { AppDataSource } from '@/config/data-source';
import { PrintJob, PrintJobStatus } from '@/database/entities/printJob.entity';
import { PrintJobItem } from '@/database/entities/printJobItem.entity';
import { evaluatePrintPolicy } from '@/modules/saas/services/printPolicy.service';
import { settleShortfall } from '@/modules/saas/services/costReconciliation.service';

export type ReleaseResult =
  | { ok: true; batch: boolean; total: number }
  | { ok: false; status: number; code: string; message: string; amountDue?: number };

const notReleasable = (job: PrintJob): ReleaseResult => ({
  ok: false,
  status: 409,
  code: 'JOB_NOT_RELEASABLE',
  message: `This job is ${job.status} and can't be sent to the printer.`,
});

async function applyPolicy(job: PrintJob, totalPagesHint?: number): Promise<ReleaseResult & { items?: PrintJobItem[] }> {
  const items = await AppDataSource.getRepository(PrintJobItem).find({
    where: { printJobId: job.id },
    order: { order: 'ASC' },
  });
  const check = async (cfg: any, totalPages: number, fileName: string) =>
    evaluatePrintPolicy({
      totalPages,
      copies: cfg.copies || 1,
      color: cfg.color === 'color' ? 'color' : 'bw',
      sided: cfg.sided === 'double' ? 'double' : 'single',
      paper: cfg.paper || 'A4',
      fileName,
      jobType: job.jobType,
    });
  const mutate = (cfg: any, pol: any) => ({
    ...cfg,
    copies: pol.mutated.copies,
    sided: pol.mutated.sided,
    color: pol.mutated.color,
    paper: pol.mutated.paper || cfg.paper || 'A4',
  });

  if (items.length) {
    for (const it of items) {
      const cfg: any = it.printConfiguration || {};
      const pol = await check(cfg, it.totalPages || 1, it.fileName);
      if (!pol.allow) {
        return {
          ok: false,
          status: 403,
          code: 'PRINT_POLICY_DENIED',
          message: `${it.fileName}: ${pol.deniedReason || 'Blocked by print policy.'}`,
        };
      }
      it.printConfiguration = mutate(cfg, pol);
    }
    await AppDataSource.getRepository(PrintJobItem).save(items);
    return { ok: true, batch: true, total: items.length };
  }

  const cfg: any = job.printConfiguration || {};
  const pol = await check(cfg, job.totalPages || totalPagesHint || 1, job.fileName);
  if (!pol.allow) {
    return { ok: false, status: 403, code: 'PRINT_POLICY_DENIED', message: pol.deniedReason || 'Blocked by print policy.' };
  }
  job.printConfiguration = mutate(cfg, pol);
  return { ok: true, batch: false, total: 1 };
}

export async function releaseJobToKiosk(
  job: PrintJob,
  kioskId: string | null,
  opts: { totalPagesHint?: number } = {},
): Promise<ReleaseResult> {
  if (job.status !== PrintJobStatus.READY) return notReleasable(job);

  const settlement = await settleShortfall(job.id);
  if (settlement.reason === 'charge-failed' || settlement.reason === 'no-card-on-file') {
    return {
      ok: false,
      status: 402,
      code: 'PAYMENT_DUE',
      message: `Final price is ₦${settlement.shortfall} more than what you paid, and the saved card could not be charged. Please contact the shop to settle the difference.`,
      amountDue: settlement.shortfall,
    };
  }

  const policy = await applyPolicy(job, opts.totalPagesHint);
  if (!policy.ok) return policy;

  const upd = await AppDataSource.getRepository(PrintJob)
    .createQueryBuilder()
    .update(PrintJob)
    .set({ status: PrintJobStatus.RELEASING, kioskId: kioskId as any, pagesCompleted: 0, printConfiguration: job.printConfiguration })
    .where('id = :id AND status = :ready', { id: job.id, ready: PrintJobStatus.READY })
    .execute();
  if ((upd.affected ?? 0) !== 1) return notReleasable(job);
  return policy;
}
