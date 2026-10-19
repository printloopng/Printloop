import { z } from 'zod';

export const participantUploadBodySchema = z.object({
  fileBase64: z.string().optional(),
  fileName: z.string().min(1).max(255).optional(),
  mimeType: z.string().max(100).optional(),
  printConfiguration: z.union([z.record(z.string(), z.unknown()), z.string().max(2000)]).optional(),
  promotionCode: z.string().max(64).optional(),
});
