import { z } from 'zod';

const colorHex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'must be a 7-char #RRGGBB hex');

const httpUrl = z.string().regex(/^https?:\/\/.+/i, 'must be an http(s):// URL');

export const brandingPutBodySchema = z
  .object({
    wordmark: z.string().nullable().optional(),
    tagline: z.string().nullable().optional(),
    logoUrl: z.union([httpUrl, z.literal(''), z.null()]).optional(),
    faviconUrl: z.union([httpUrl, z.literal(''), z.null()]).optional(),
    primaryColor: z.union([colorHex, z.null()]).optional(),
    secondaryColor: z.union([colorHex, z.null()]).optional(),
    accentColor: z.union([colorHex, z.null()]).optional(),
    emailFromName: z.string().nullable().optional(),
    supportEmail: z.string().nullable().optional(),
    supportPhone: z.string().nullable().optional(),
  })
  .passthrough();

export const deletePhotoBodySchema = z.object({
  url: z.string().min(1, 'Photo URL is required'),
});
