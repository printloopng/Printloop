import { z } from 'zod';

// The document arrives as multipart `file` (preferred) or `fileBase64`.
// Page count and storage location are derived server-side from the bytes.
export const participantUploadBodySchema = z.object({
  fileBase64: z.string().optional(),
  fileName: z.string().min(1).max(255).optional(),
  mimeType: z.string().max(100).optional(),
  // JSON object, or a JSON string when sent as a multipart field.
  printConfiguration: z.union([z.record(z.string(), z.unknown()), z.string().max(2000)]).optional(),
  promotionCode: z.string().max(64).optional(),
});
