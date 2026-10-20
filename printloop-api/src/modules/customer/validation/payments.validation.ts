import { z } from 'zod';

export const initializeJobPaymentBodySchema = z.object({
  jobId: z.string().trim().min(1),
  callbackUrl: z.string().trim().max(2048).optional(),
});
