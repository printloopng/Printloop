import { Request, Response, NextFunction } from 'express';
import { z, ZodTypeAny, ZodError } from 'zod';

const requiredRegistrationMessage = 'All registration fields are required';

export const registerSchema = z
  .object({
    firstName: z.union([z.string(), z.undefined(), z.null()]),
    lastName: z.union([z.string(), z.undefined(), z.null()]),
    email: z.union([z.string(), z.undefined(), z.null()]),
    phoneNumber: z.union([z.string(), z.undefined(), z.null()]),
    password: z.union([z.string(), z.undefined(), z.null()]),
  })
  .superRefine((data, ctx) => {
    if (
      !data.firstName ||
      !data.lastName ||
      !data.email ||
      !data.phoneNumber ||
      !data.password
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: requiredRegistrationMessage,
      });
    }
  });

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z
  .object({
    email: z.union([z.string(), z.undefined(), z.null()]),
    password: z.union([z.string(), z.undefined(), z.null()]),
    totpCode: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.email || !data.password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Email and password are required',
      });
    }
  });

export type LoginInput = z.infer<typeof loginSchema>;

export const updateProfileSchema = z
  .object({
    firstName: z.union([z.string(), z.undefined(), z.null()]),
    lastName: z.union([z.string(), z.undefined(), z.null()]),
    phoneNumber: z.union([z.string(), z.undefined(), z.null()]),
  })
  .superRefine((data, ctx) => {
    if (!data.firstName || !data.lastName || !data.phoneNumber) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'First name, last name, and phone number are required',
      });
    }
  });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z
  .object({
    oldPassword: z.union([z.string(), z.undefined(), z.null()]),
    newPassword: z.union([z.string(), z.undefined(), z.null()]),
  })
  .superRefine((data, ctx) => {
    if (!data.oldPassword || !data.newPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Old password and new password are required',
      });
      return;
    }
    if (String(data.newPassword).length < 10) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'New password must be at least 10 characters long',
      });
    }
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const closeAccountSchema = z.object({
  confirmEmail: z.string().optional(),
});

export type CloseAccountInput = z.infer<typeof closeAccountSchema>;

export function validateAuthBody(schema: ZodTypeAny) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = await schema.parseAsync(req.body);
      if (
        parsed &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed) &&
        req.body &&
        typeof req.body === 'object' &&
        !Array.isArray(req.body)
      ) {
        const out = parsed as Record<string, unknown>;
        for (const key of Object.keys(req.body)) {
          if (!(key in out)) continue;
          if (out[key] === undefined) delete req.body[key];
          else req.body[key] = out[key];
        }
        for (const key of Object.keys(out)) {
          if (key in req.body || key in req.query || key in req.params) continue;
          if (out[key] !== undefined) req.body[key] = out[key];
        }
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const issues = error.issues ?? [];
        const message = issues[0]?.message ?? 'Validation failed';
        res.status(400).json({ success: false, message });
        return;
      }
      next(error);
    }
  };
}
