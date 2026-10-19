import { Request, Response, NextFunction } from 'express';
import { paystackService } from '@/core/services/paystack.service';

export class PaystackWebhookController {
  handle = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const signature = req.header('x-paystack-signature');
      const rawBody: Buffer | undefined = (req as any).rawBody;
      if (!rawBody) {
        res.status(400).json({ success: false, message: 'Raw body unavailable' });
        return;
      }
      if (!paystackService.verifyWebhookSignature(rawBody, signature)) {
        res.status(401).json({ success: false, message: 'Invalid signature' });
        return;
      }
      const result = await paystackService.handleWebhook(req.body);
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };
}

export const paystackWebhookController = new PaystackWebhookController();
