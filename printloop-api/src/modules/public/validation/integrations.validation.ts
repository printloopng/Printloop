import { z } from 'zod';

export const lmsHandoffQuerySchema = z.object({
  slug: z.string().trim().toLowerCase().min(1),
  key: z.string().min(1),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .refine((e) => !e || /.+@.+\..+/.test(e), { message: 'invalid email' }),
  format: z.string().optional(),
});
