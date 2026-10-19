import { Request } from 'express';
import bcrypt from 'bcryptjs';
import { repos } from '@/config/repos';
import { User, UserRole } from '@/database/entities/user.entity';
import { signAccessToken, loadMembershipsForUser } from '@/core/utils/jwt';
import { writeAudit } from '@/core/services/audit.service';
import type {
  RegisterInput,
  LoginInput,
  UpdateProfileInput,
  ChangePasswordInput,
} from '@/modules/customer/validation/auth.validation';

export function publicUser(user: User) {
  const { passwordHash, salt, verificationToken, resetToken, ...safe } = user as any;
  return { ...safe, role: user.role || UserRole.USER, adminPrivileges: user.adminPrivileges || [] };
}

async function resolveTenantId(req: Request): Promise<string | null> {
  let tenantId = req.tenant?.id ?? null;
  if (!tenantId) {
    const { LEGACY_TENANT_SLUG } = await import('@/common/middleware/tenant.middleware');
    const legacy = await repos.tenant().findOne({
      where: { slug: LEGACY_TENANT_SLUG },
    });
    tenantId = legacy?.id ?? null;
  }
  return tenantId;
}

export class CustomerAuthService {
  async register(req: Request, body: RegisterInput) {
    const firstName = String(body.firstName);
    const lastName = String(body.lastName);
    const phoneNumber = String(body.phoneNumber);
    const password = String(body.password);
    const repo = repos.user();
    const normEmail = String(body.email).trim().toLowerCase();

    const tenantId = await resolveTenantId(req);
    if (!tenantId) {
      return {
        status: 500 as const,
        body: { success: false, message: 'No tenant could be resolved for this signup' },
      };
    }

    if (await repo.findOne({ where: { email: normEmail, tenantId } })) {
      return {
        status: 409 as const,
        body: { success: false, message: 'An account with this email already exists' },
      };
    }

    const passwordHash = await bcrypt.hash(String(password), 12);
    const user = repo.create({
      tenantId,
      firstName,
      lastName,
      email: normEmail,
      phoneNumber,
      passwordHash,
      salt: 'bcrypt',
      isEmailVerified: true,
      role: UserRole.USER,
      adminPrivileges: [],
    });
    const saved = await repo.save(user);

    const walletRepo = repos.wallet();
    await walletRepo.save(
      walletRepo.create({
        userId: saved.id,
        tenantId,
        balance: 0,
      }),
    );

    const memberships = await loadMembershipsForUser(saved.id);
    const accessToken = signAccessToken({
      userId: saved.id,
      role: saved.role,
      memberships,
    });

    if (saved.tenantId) {
      const { emitTenantEvent } = await import('@/modules/saas/services/tenantWebhook.service');
      const { WebhookEvent } = await import('@/database/entities/tenantWebhook.entity');
      emitTenantEvent(saved.tenantId, WebhookEvent.CUSTOMER_SIGNED_UP, {
        userId: saved.id,
        email: saved.email,
        firstName: saved.firstName,
        lastName: saved.lastName,
        phoneNumber: saved.phoneNumber,
      });
    }

    return {
      status: 201 as const,
      body: {
        success: true,
        message: 'Account created',
        data: { user: publicUser(saved), tokens: { accessToken } },
      },
    };
  }

  async login(req: Request, body: LoginInput) {
    const { email, password, totpCode } = body;
    const repo = repos.user();
    const tenantId = await resolveTenantId(req);
    const normEmail = String(email).trim().toLowerCase();

    let user = await repo.findOne({
      where: tenantId ? { email: normEmail, tenantId } : { email: normEmail },
    });
    if (!user && tenantId) {
      user = await repo.findOne({ where: { email: normEmail } });
    }
    if (!user || !(await bcrypt.compare(String(password), user.passwordHash))) {
      return {
        status: 401 as const,
        body: { success: false, message: 'Invalid email or password' },
      };
    }
    if (user.isBlocked) {
      return {
        status: 403 as const,
        body: { success: false, message: 'This account is blocked.' },
      };
    }

    if (user.totpEnabled && user.totpSecret) {
      const { verifyTotp } = await import('@/core/utils/totp');
      const code = String(totpCode || '');
      if (!code) {
        return {
          status: 401 as const,
          body: {
            success: false,
            message: 'Two-factor code required',
            code: 'TOTP_REQUIRED',
          },
        };
      }
      if (!verifyTotp(user.totpSecret, code)) {
        return {
          status: 401 as const,
          body: {
            success: false,
            message: 'Invalid two-factor code',
            code: 'TOTP_INVALID',
          },
        };
      }
    }

    user.lastLoginAt = new Date();
    await repo.save(user);
    const memberships = await loadMembershipsForUser(user.id);
    const accessToken = signAccessToken({
      userId: user.id,
      role: user.role,
      memberships,
    });

    return {
      status: 200 as const,
      body: { success: true, data: { user: publicUser(user), tokens: { accessToken } } },
    };
  }

  getMe(user: User) {
    return {
      status: 200 as const,
      body: { success: true, data: publicUser(user) },
    };
  }

  async updateProfile(user: User, body: UpdateProfileInput) {
    const { firstName, lastName, phoneNumber } = body;
    const repo = repos.user();
    user.firstName = String(firstName).trim();
    user.lastName = String(lastName).trim();
    user.phoneNumber = String(phoneNumber).trim();
    const saved = await repo.save(user);
    return {
      status: 200 as const,
      body: {
        success: true,
        message: 'Profile updated successfully',
        data: publicUser(saved),
      },
    };
  }

  async changePassword(user: User, body: ChangePasswordInput) {
    const { oldPassword, newPassword } = body;
    const isMatch = await bcrypt.compare(String(oldPassword), user.passwordHash);
    if (!isMatch) {
      return {
        status: 400 as const,
        body: { success: false, message: 'Incorrect old password' },
      };
    }

    const repo = repos.user();
    user.passwordHash = await bcrypt.hash(String(newPassword), 12);
    await repo.save(user);

    return {
      status: 200 as const,
      body: { success: true, message: 'Password updated successfully' },
    };
  }

  async exportData(req: Request, user: User) {
    const [
      printJobs,
      payments,
      transactions,
      files,
      groupSessions,
      groupParticipants,
      disputes,
      reviews,
      auditLogs,
    ] = await Promise.all([
      repos.printJob().find({ where: { userId: user.id } }),
      repos.payment().find({ where: { userId: user.id } }),
      repos.transaction().findByWalletUserId(user.id),
      repos.file().findByPrintJobUserId(user.id),
      repos.groupSession().find({ where: { hostUserId: user.id } }),
      repos.groupParticipant().find({ where: { userId: user.id } }),
      repos.dispute().find({ where: { userId: user.id } }),
      repos.shopReview().find({ where: { userId: user.id } }),
      repos.auditLog().find({ where: { actorId: user.id } }),
    ]);

    const printJobIds = printJobs.map((pj) => pj.id);
    const printJobItems = printJobIds.length
      ? await repos.printJobItem().find({
          where: { printJobId: printJobIds[0] },
        })
      : [];

    const userPrintJobItems = printJobItems.filter((pji) =>
      printJobIds.includes(pji.printJobId),
    );

    const promotions = user.tenantId
      ? await repos.promotion().find({ where: { tenantId: user.tenantId } })
      : [];

    const repo = repos.user();
    const freshUser = await repo.findOne({ where: { id: user.id } });
    const { passwordHash, salt, verificationToken, resetToken, printToken, ...safeUser } =
      freshUser!;

    await writeAudit(req, 'customer.export', `user:${user.id}`, {
      email: user.email,
      printJobs: printJobs.length,
      transactions: transactions.length,
    });

    const payload = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      user: safeUser,
      printJobs,
      printJobItems: userPrintJobItems,
      payments,
      transactions,
      files,
      promotions,
      groupSessions,
      groupParticipants,
      disputes,
      reviews,
      auditLogs,
    };

    return {
      status: 200 as const,
      attachmentFilename: `printloop-customer-export-${user.id}-${new Date()
        .toISOString()
        .slice(0, 10)}.json`,
      body: payload,
    };
  }

  async closeAccount(req: Request, user: User, confirmEmail: string) {
    const normConfirm = String(confirmEmail || '').trim().toLowerCase();
    const normEmail = user.email.toLowerCase();

    if (normConfirm !== normEmail) {
      return {
        status: 400 as const,
        body: {
          success: false,
          message: `Type your email "${user.email}" to confirm account closure`,
          code: 'CONFIRM_EMAIL_MISMATCH',
        },
      };
    }

    if (user.isBlocked) {
      return {
        status: 409 as const,
        body: { success: false, message: 'Account already closed' },
      };
    }

    user.isBlocked = true;
    await repos.user().save(user);

    await writeAudit(req, 'customer.close', `user:${user.id}`, {
      email: user.email,
    });

    return {
      status: 200 as const,
      body: {
        success: true,
        message:
          'Account closed. 30-day cooling-off window started. Contact support to reverse, otherwise data will be deleted.',
        data: { id: user.id, status: 'CLOSED' },
      },
    };
  }
}
