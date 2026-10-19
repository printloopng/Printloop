import { z } from 'zod';

export const createSaasKioskBodySchema = z.object({
  name: z.string().min(1, 'Printer name is required'),
  location: z.string().optional(),
  printerName: z.string().optional(),
});

export const kioskStatusBodySchema = z.object({
  status: z.string().min(1, 'Invalid status'),
});
