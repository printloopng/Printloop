import { z } from 'zod';

export const participantUploadBodySchema = z
  .object({
    fileURL: z.string().optional(),
    fileBase64: z.string().optional(),
    fileName: z.string().min(1),
    pageCount: z.coerce.number().int().min(1),
    mimeType: z.string().optional(),
    sizeBytes: z.coerce.number().optional(),
    printConfiguration: z.record(z.string(), z.unknown()).optional(),
    promotionCode: z.string().optional(),
  })
  .refine((b) => Boolean(b.fileURL || b.fileBase64), {
    message: 'fileName, pageCount and one of fileURL/fileBase64 are required',
  });
