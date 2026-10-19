import { z } from 'zod';

export const renderCallbackBodySchema = z.object({
  printJobId: z.string().min(1),
  renderedKey: z.string().min(1),
  renderedPdfUrl: z.string().min(1),
  previewImageUrls: z.array(z.string()),
  pageCount: z.number(),
  bytes: z.number().optional(),
  durationMs: z.number().optional(),
});

export const renderFailureBodySchema = z.object({
  printJobId: z.string().min(1),
  errorMessage: z.string().optional(),
});
