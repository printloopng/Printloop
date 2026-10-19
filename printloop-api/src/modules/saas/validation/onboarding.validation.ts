import { z } from 'zod';

export const signupBodySchema = z.object({
  businessName: z.string().optional(),
  slug: z.string().optional(),
  ownerFirstName: z.string().optional(),
  ownerLastName: z.string().optional(),
  ownerEmail: z.string().optional(),
  ownerPhone: z.string().optional(),
  ownerPassword: z.string().optional(),
  address: z.string().optional(),
});

export const checkSlugBodySchema = z.object({
  slug: z.string().optional(),
});

export const verifyEmailBodySchema = z.object({
  token: z.string().optional(),
  email: z.string().optional(),
});

export const resendVerificationBodySchema = z.object({
  email: z.string().min(1, 'email is required'),
  tenantSlug: z.string().optional(),
});

export const paystackSubaccountBodySchema = z.object({
  businessName: z.string().min(1, 'businessName, settlementBank, accountNumber are required'),
  settlementBank: z.string().min(1),
  accountNumber: z.string().min(1),
  percentageCharge: z.number().optional(),
});

export const bankAccountSetupBodySchema = z.object({
  accountName: z.string().min(1, 'accountName, accountNumber, bankCode are required'),
  accountNumber: z.string().min(1),
  bankCode: z.string().min(1),
});
