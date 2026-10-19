import { z } from 'zod';

export const availabilityBodySchema = z.object({
  availability: z.enum(['open', 'busy', 'closed'], {
    message: "availability must be 'open', 'busy' or 'closed'",
  }),
});

export const locationPatchBodySchema = z
  .object({
    address: z.union([z.string(), z.null()]).optional(),
    isDiscoverable: z.boolean().optional(),
  })
  .passthrough();

export const totpCodeBodySchema = z.object({
  code: z.string().optional(),
});
