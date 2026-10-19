import { z } from 'zod';

export const editUploadBodySchema = z.object({
  documentUrl: z.string().min(1, 'Edited document URL is required'),
  pageCount: z.number().optional(),
  fileSize: z.number().optional(),
  editOperations: z.array(z.unknown()).optional(),
  shopNotes: z.string().nullable().optional(),
});

export const editRejectBodySchema = z.object({
  reason: z.string().optional(),
});
