import { z } from 'zod';
import { DisputeStatus } from '@/database/entities/dispute.entity';

export const resolveDisputeBodySchema = z.object({
  status: z.enum([DisputeStatus.RESOLVED, DisputeStatus.REJECTED]),
  resolutionNotes: z.string().optional(),
});
