import { z } from 'zod';

export const initializeJobPaymentBodySchema = z.object({
  jobId: z.string().trim().min(1),
});
