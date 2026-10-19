import { z } from 'zod';

export const agentPollBodySchema = z.object({
  // Jobs the kiosk still holds (printing, or awaiting a complete/failed ack).
  inFlight: z.array(z.string().uuid()).max(50).optional(),
  // How many new jobs to claim this tick; 0 = just report in (busy / printer down).
  max: z.number().int().min(0).max(5).optional(),
});

export const agentProgressBodySchema = z.object({
  pagesCompleted: z.number().int().min(0),
});

export const agentCompleteBodySchema = z.object({
  confirmation: z.enum(['confirmed', 'unconfirmed']).optional(),
  method: z.enum(['ipp-job-state', 'queue-drain', 'none']).optional(),
  detail: z.string().max(200).optional(),
});

export const agentFailedBodySchema = z.object({
  reason: z.string().max(280).optional(),
  retryable: z.boolean().optional(),
});

export const agentCapabilitiesBodySchema = z.object({
  color: z.boolean().optional(),
  duplex: z.boolean().optional(),
  a3: z.boolean().optional(),
  media: z.array(z.string().max(64)).max(50).optional(),
});
