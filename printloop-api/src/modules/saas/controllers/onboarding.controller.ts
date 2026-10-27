import { Request, Response, NextFunction } from 'express';
import { DataSource } from 'typeorm';
import { Tenant } from '@/database/entities/tenant.entity';
import { PayoutSchedule } from '@/database/entities/payoutSchedule.entity';
import {
  signupTenant,
  verifyOwnerEmail,
  resendOwnerVerification,
  SlugUnavailableError,
  EmailTakenError,
  ValidationError,
} from '@/modules/saas/services/onboarding.service';
import { PaystackService } from '@/core/services/paystack.service';
import {
  bankAccountSetupBodySchema,
  checkSlugBodySchema,
  paystackSubaccountBodySchema,
  resendVerificationBodySchema,
  signupBodySchema,
  verifyEmailBodySchema,
} from '@/modules/saas/validation/onboarding.validation';

function zodMessage(err: { issues: { message: string }[] }): string {
  return err.issues[0]?.message ?? 'Validation failed';
}

export class OnboardingController {
  private paystack = new PaystackService();

  constructor(private ds: DataSource) {}

  signup = async (req: Request, res: Response, next: NextFunction) => {
    try {
      signupBodySchema.safeParse(req.body ?? {});
      const result = await signupTenant({
        businessName: req.body?.businessName,
        slug: req.body?.slug,
        ownerFirstName: req.body?.ownerFirstName,
        ownerLastName: req.body?.ownerLastName,
        ownerEmail: req.body?.ownerEmail,
        ownerPhone: req.body?.ownerPhone,
        ownerPassword: req.body?.ownerPassword,
        address: req.body?.address,
      });
      res.status(201).json({ success: true, data: result });
    } catch (err: any) {
      if (err instanceof ValidationError) {
        res.status(400).json({ success: false, message: err.message });
        return;
      }
      if (err instanceof SlugUnavailableError) {
        res.status(409).json({
          success: false,
          message: err.message,
          code: 'SLUG_TAKEN',
        });
        return;
      }
      if (err instanceof EmailTakenError) {
        res.status(409).json({
          success: false,
          message: err.message,
          code: 'EMAIL_TAKEN',
        });
        return;
      }
      console.error('Signup error:', err);
      res.status(500).json({
        success: false,
        message: err?.message || 'Signup failed',
      });
    }
  };

  checkSlug = async (req: Request, res: Response) => {
    const parsed = checkSlugBodySchema.safeParse(req.body ?? {});
    const slug = String(parsed.success ? parsed.data.slug : req.body?.slug || '')
      .toLowerCase()
      .trim();
    if (!slug) {
      res.json({ available: false, reason: 'empty' });
      return;
    }
    if (!/^[a-z][a-z0-9-]{1,28}[a-z0-9]$/.test(slug)) {
      res.json({ available: false, reason: 'invalid-format' });
      return;
    }
    const existing = await this.ds.getRepository(Tenant).findOne({
      where: { slug },
    });
    res.json({ available: !existing });
  };

  verifyEmail = async (req: Request, res: Response) => {
    try {
      verifyEmailBodySchema.safeParse(req.body ?? {});
      const token = String(req.body?.token || '').trim();
      const email = req.body?.email ? String(req.body.email).trim() : undefined;
      const result = await verifyOwnerEmail({ token, email });
      if (!result.verified) {
        res
          .status(400)
          .json({ success: false, message: 'Invalid or expired token' });
        return;
      }
      res.json({ success: true, data: result });
    } catch (err: any) {
      if (err instanceof ValidationError) {
        res.status(400).json({ success: false, message: err.message });
        return;
      }
      console.error('Verify-email error:', err);
      res
        .status(500)
        .json({ success: false, message: err?.message || 'Verification failed' });
    }
  };

  resendVerification = async (req: Request, res: Response) => {
    try {
      const parsed = resendVerificationBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ success: false, message: zodMessage(parsed.error) });
        return;
      }
      const { email, tenantSlug } = parsed.data;
      await resendOwnerVerification({ email: email.trim(), tenantSlug: tenantSlug?.trim() });
      res.json({ success: true });
    } catch (err: any) {
      console.error('Resend-verification error:', err);
      res.json({ success: true });
    }
  };

  setupPaystackSubaccount = async (req: Request, res: Response) => {
    try {
      const parsed = paystackSubaccountBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          message: 'bankCode and a 10-digit accountNumber are required',
        });
        return;
      }
      const tenant = req.tenant!;
      const { businessName, bankCode, accountNumber } = parsed.data;
      const created = await this.paystack.createSubaccount({
        businessName: businessName || tenant.name,
        settlementBank: bankCode,
        accountNumber,
        percentageCharge: Number(tenant.commissionPct),
      });
      tenant.paystackSubaccountCode = created.subaccountCode;
      await this.ds.getRepository(Tenant).save(tenant);
      res.json({
        success: true,
        data: {
          subaccountCode: created.subaccountCode,
          accountName: created.accountName,
        },
      });
    } catch (err: any) {
      console.error('Subaccount setup error:', err?.response?.data || err);
      res.status(500).json({
        success: false,
        message: err?.message || 'Subaccount setup failed',
      });
    }
  };

  setupBankAccount = async (req: Request, res: Response) => {
    try {
      const parsed = bankAccountSetupBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          message: 'accountName, bankCode and a 10-digit accountNumber are required',
        });
        return;
      }
      const tenant = req.tenant!;
      const { accountName, accountNumber, bankCode } = parsed.data;
      const { recipientCode } = await this.paystack.createTransferRecipient({
        name: accountName,
        accountNumber,
        bankCode,
      });
      const scheduleRepo = this.ds.getRepository(PayoutSchedule);
      let schedule = await scheduleRepo.findOne({
        where: { tenantId: tenant.id },
      });
      if (!schedule) {
        schedule = scheduleRepo.create({ tenantId: tenant.id });
      }
      schedule.accountName = accountName;
      schedule.accountNumber = accountNumber;
      schedule.bankCode = bankCode;
      schedule.recipientCode = recipientCode;
      await scheduleRepo.save(schedule);
      res.json({
        success: true,
        data: { recipientCode, accountName, bankCode },
      });
    } catch (err: any) {
      console.error('Bank account setup error:', err?.response?.data || err);
      res.status(500).json({
        success: false,
        message: err?.message || 'Bank account setup failed',
      });
    }
  };
}
