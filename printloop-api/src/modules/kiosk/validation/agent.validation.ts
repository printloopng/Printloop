import { z } from 'zod';

export const agentCompleteBodySchema = z.object({
  confirmation: z.enum(['confirmed', 'unconfirmed']).optional(),
  method: z.enum(['ipp-job-state', 'queue-drain', 'none']).optional(),
  detail: z.string().max(200).optional(),
});

export const agentFailedBodySchema = z.object({
  reason: z.string().max(280).optional(),
});

export const agentCapabilitiesBodySchema = z.object({
  color: z.boolean().optional(),
  duplex: z.boolean().optional(),
  a3: z.boolean().optional(),
  media: z.array(z.string().max(64)).max(50).optional(),
});
