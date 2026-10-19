import { z } from 'zod';

export const claimDomainBodySchema = z.object({
  domain: z.string().optional(),
});
