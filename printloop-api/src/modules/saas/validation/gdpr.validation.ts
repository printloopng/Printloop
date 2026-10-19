import { z } from 'zod';

export const deleteTenantBodySchema = z.object({
  confirmSlug: z.string().optional(),
  reason: z.string().optional(),
});
