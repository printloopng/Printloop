import { Request, Response, NextFunction } from 'express';
import { PaystackService } from '@/core/services/paystack.service';
import { AppDataSource } from '@/config/data-source';
import { PrintJob, PrintJobStatus } from '@/database/entities/printJob.entity';
import { initializeJobPaymentBodySchema } from '@/modules/customer/validation/payments.validation';
import { Tenant } from '@/database/entities/tenant.entity';
import { isTrustedReturnUrl } from '@/core/utils/appUrls';

const paystack = new PaystackService();
const hasPaystack = Boolean(process.env.PAYSTACK_SECRET_KEY);

export class CustomerPaymentsController {
  initializeJobPayment = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const user = (req as any).user;
      const parsed = initializeJobPaymentBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ success: false, message: 'jobId is required' });
        return;
      }
      const jobId = parsed.data.jobId;

      const jobRepo = AppDataSource.getRepository(PrintJob);
      const job = await jobRepo.findOne({ where: { id: jobId, userId: user.id } });
      if (!job) {
        res.status(404).json({ success: false, message: 'Print job not found' });
        return;
      }
      if (job.status !== PrintJobStatus.PENDING) {
        res.status(400).json({ success: false, message: 'Job is not in PENDING state' });
        return;
      }
      const amount = Number(job.cost);
      if (amount <= 0) {
        res.status(400).json({ success: false, message: 'Job has zero cost' });
        return;
      }
      if (!hasPaystack) {
        const reference = `DEV_JOB_${job.id}_${Date.now()}`;
        res.json({
          success: true,
          data: {
            authorizationUrl: `https://checkout.paystack.com/mock_${reference}`,
            reference,
            mock: true,
          },
        });
        return;
      }
      const tenant = job.tenantId
        ? await AppDataSource.getRepository(Tenant).findOne({ where: { id: job.tenantId } })
        : null;
      const callbackUrl = isTrustedReturnUrl(parsed.data.callbackUrl, tenant?.customDomain)
        ? parsed.data.callbackUrl
        : undefined;
      const data = await paystack.initializeJobPayment(
        user.id,
        job.id,
        amount,
        user.email,
        tenant ?? undefined,
        callbackUrl,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

}

export const customerPaymentsController = new CustomerPaymentsController();
