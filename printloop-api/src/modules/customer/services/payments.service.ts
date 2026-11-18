import { repos } from '@/config/repos';
import { enqueueRenderOrReady } from '@/modules/public/services/renderEnqueue.service';
import { applyTransactionDelta } from '@/modules/saas/services/tenantBalance.service';
import { computeCommissionSplit } from '@/modules/saas/services/commission.service';
import { GroupSessionService } from '@/modules/customer/services/groupSession.service';
import { JobType } from '@/database/entities/printJob.entity';

export async function completePrintJobPayment(
  jobId: string,
  reference: string,
  opts: { authorizationCode?: string | null; paidKobo: number; currency?: string | null },
): Promise<{ success: boolean; code?: string }> {
  const result = await repos.printJob().completePrintJobPayment(
    jobId,
    reference,
    opts,
    (tenant, cost) => computeCommissionSplit(tenant, cost).commissionAmount,
  );

  if (result.completedPayment && result.job?.tenantId) {
    try {
      await applyTransactionDelta(
        result.job.tenantId,
        Number(result.job.cost),
        result.commissionAmount ?? 0,
      );
    } catch (e) {
      console.error('[tenant_balance] applyTransactionDelta failed in completePrintJobPayment:', e);
    }
  }

  if (result.completedPayment && result.job?.user) {
    const job = result.job;
    const user = job.user!;
    const code = result.code!;
    try {
      const { enqueueNotification } = await import('@/workers/notification.enqueue');
      await enqueueNotification('print-job-code', {
        email: user.email || undefined,
        phoneNumber: user.phoneNumber || undefined,
        code,
        fileName: job.fileName || 'Document',
        cost: Number(job.cost),
      });
    } catch (notifyErr) {
      console.warn('[notifications] Failed to queue print-job-code:', notifyErr);
    }
  }

  if (result.success && result.job?.jobType === JobType.GROUP_BATCH) {
    try {
      await new GroupSessionService().markParticipantPaid(jobId);
    } catch (e) {
      console.error('Failed to mark group participant paid:', e);
    }
  }

  if (result.completedPayment && result.needsRender) {
    try {
      await enqueueRenderOrReady(jobId);
    } catch (e) {
      console.error('Failed to enqueue render for paid job:', e);
    }
  }

  return { success: result.success, code: result.code };
}
