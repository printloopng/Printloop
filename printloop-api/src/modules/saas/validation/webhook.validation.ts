import { z } from 'zod';

export const createWebhookBodySchema = z.object({
  name: z.string().min(1, 'name and url are required'),
  url: z.string().regex(/^https?:\/\/.+/i, 'url must be http(s)://...'),
  events: z.array(z.string()).optional(),
});

export const patchWebhookBodySchema = z
  .object({
    name: z.string().optional(),
    events: z.array(z.string()).optional(),
    isActive: z.boolean().optional(),
  })
  .passthrough();
