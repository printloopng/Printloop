import { repos } from '@/config/repos';
import { enqueueRenderOrReady } from '@/modules/public/services/renderEnqueue.service';
import { applyTransactionDelta } from '@/modules/saas/services/tenantBalance.service';
import { computeCommissionSplit } from '@/modules/saas/services/commission.service';

export async function completePrintJobPayment(
  jobId: string,
  reference: string,
  opts?: { authorizationCode?: string | null },
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

  if (result.completedPayment && result.job) {
    const job = result.job;
    const user = job.user;
    if (!user) {
      return { success: result.success, code: result.code };
    }
    const code = result.code!;
    const message = `Your PrintLoop code is: ${code}. Release your print at the kiosk.`;

    if (user.phoneNumber) {
      try {
        const { SMSService } = await import('@/core/services/sms.service');
        const sms = new SMSService();
        await sms.sendPrintJobCode({
          phoneNumber: user.phoneNumber,
          jobCode: code,
          fileName: job.fileName || 'Document',
          cost: Number(job.cost),
        });
      } catch (smsErr) {
        console.warn('[notifications] Failed to send SMS:', smsErr);
      }
    }

    if (user.email) {
      try {
        const { EmailService } = await import('@/core/services/email.service');
        const emailService = new EmailService();
        await emailService.send({
            to: user.email,
          subject: 'Your PrintLoop Release Code',
          text: message,
          html: `<p>Your PrintLoop code is: <strong>${code}</strong>.</p><p>Release your print at the kiosk.</p>`,
        });
      } catch (emailErr) {
        console.warn('[notifications] Failed to send email:', emailErr);
      }
    }
  }

  if (result.success) {
    try {
      await enqueueRenderOrReady(jobId);
    } catch (e) {
      console.error('Failed to enqueue render for paid job:', e);
    }
    try {
      const job = await repos.printJob().findOne({
        where: { id: jobId },
      });
      if (job?.requiresAccept) {
        const { scheduledQueue } = await import('@/workers/queues');
        const { ACCEPT_WINDOW_MS } = await import('./acceptWindow.service');
        await scheduledQueue.add(
          'accept-window',
          { printJobId: job.id },
          {
            delay: ACCEPT_WINDOW_MS,
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
            jobId: `accept-window:${job.id}`,
          },
        );
      }
    } catch (e) {
      console.error('Failed to arm accept window:', e);
    }
  }

  return { success: result.success, code: result.code };
}
