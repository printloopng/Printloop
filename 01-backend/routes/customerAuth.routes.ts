import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { AppDataSource } from '../config/database';
import { User, UserRole } from '../entities/user.entity';
import { Wallet } from '../entities/wallet.entity';
import { PrintJob } from '../entities/printJob.entity';
import { PrintJobItem } from '../entities/printJobItem.entity';
import { File } from '../entities/file.entity';
import { Transaction } from '../entities/transaction.entity';
import { Payment } from '../entities/payment.entity';
import { Promotion } from '../entities/promotion.entity';
import { GroupSession } from '../entities/groupSession.entity';
import { GroupParticipant } from '../entities/groupParticipant.entity';
import { Dispute } from '../entities/dispute.entity';
import { ShopReview } from '../entities/shopReview.entity';
import { AuditLog } from '../entities/auditLog.entity';
import { signAccessToken, loadMembershipsForUser } from '../utils/jwt';
import { authenticate } from '../middleware/auth.middleware';
import { SystemSetting } from '../entities/systemSetting.entity';
import { writeAudit } from '../services/audit.service';

const router = Router();

function publicUser(user: User) {
  const { passwordHash, salt, verificationToken, resetToken, ...safe } = user as any;
  return { ...safe, role: user.role || UserRole.USER, adminPrivileges: user.adminPrivileges || [] };
}

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { firstName, lastName, email, phoneNumber, password } = req.body || {};
    if (!firstName || !lastName || !email || !phoneNumber || !password) {
      res.status(400).json({ success: false, message: 'All registration fields are required' });
      return;
    }
    const repo = AppDataSource.getRepository(User);
    const normEmail = String(email).trim().toLowerCase();

    let tenantId = req.tenant?.id ?? null;
    if (!tenantId) {
      const { Tenant } = await import('../entities/tenant.entity');
      const { LEGACY_TENANT_SLUG } = await import(
        '../middleware/tenant.middleware'
      );
      const legacy = await AppDataSource.getRepository(Tenant).findOne({
        where: { slug: LEGACY_TENANT_SLUG },
      });
      tenantId = legacy?.id ?? null;
    }
    if (!tenantId) {
      res.status(500).json({
        success: false,
        message: 'No tenant could be resolved for this signup',
      });
      return;
    }

    if (await repo.findOne({ where: { email: normEmail, tenantId } })) {
      res.status(409).json({ success: false, message: 'An account with this email already exists' });
      return;
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

    await AppDataSource.getRepository(Wallet).save(
      AppDataSource.getRepository(Wallet).create({
        userId: saved.id,
        tenantId,
        balance: 0,
      })
    );

    const memberships = await loadMembershipsForUser(saved.id);
    const accessToken = signAccessToken({
      userId: saved.id,
      role: saved.role,
      memberships,
    });

    if (saved.tenantId) {
      const { emitTenantEvent } = await import('../services/tenantWebhook.service');
      const { WebhookEvent } = await import('../entities/tenantWebhook.entity');
      emitTenantEvent(saved.tenantId, WebhookEvent.CUSTOMER_SIGNED_UP, {
        userId: saved.id,
        email: saved.email,
        firstName: saved.firstName,
        lastName: saved.lastName,
        phoneNumber: saved.phoneNumber,
      });
    }

    res.status(201).json({
      success: true,
      message: 'Account created',
      data: { user: publicUser(saved), tokens: { accessToken } },
    });
  } catch (error) {
    console.error('Customer register error:', error);
    res.status(500).json({ success: false, message: 'Registration failed' });
  }
});

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      res.status(400).json({ success: false, message: 'Email and password are required' });
      return;
    }
    const repo = AppDataSource.getRepository(User);
    let tenantId = req.tenant?.id ?? null;
    if (!tenantId) {
      const { Tenant } = await import('../entities/tenant.entity');
      const { LEGACY_TENANT_SLUG } = await import(
        '../middleware/tenant.middleware'
      );
      const legacy = await AppDataSource.getRepository(Tenant).findOne({
        where: { slug: LEGACY_TENANT_SLUG },
      });
      tenantId = legacy?.id ?? null;
    }
    const normEmail = String(email).trim().toLowerCase();
    let user = await repo.findOne({
      where: tenantId
        ? { email: normEmail, tenantId }
        : { email: normEmail },
    });
    if (!user && tenantId) {
      user = await repo.findOne({ where: { email: normEmail } });
    }
    if (!user || !(await bcrypt.compare(String(password), user.passwordHash))) {
      res.status(401).json({ success: false, message: 'Invalid email or password' });
      return;
    }
    if (user.isBlocked) {
      res.status(403).json({ success: false, message: 'This account is blocked.' });
      return;
    }
    if (user.totpEnabled && user.totpSecret) {
      const { verifyTotp } = await import('../utils/totp');
      const code = String((req.body || {}).totpCode || '');
      if (!code) {
        res.status(401).json({ success: false, message: 'Two-factor code required', code: 'TOTP_REQUIRED' });
        return;
      }
      if (!verifyTotp(user.totpSecret, code)) {
        res.status(401).json({ success: false, message: 'Invalid two-factor code', code: 'TOTP_INVALID' });
        return;
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
    res.json({ success: true, data: { user: publicUser(user), tokens: { accessToken } } });
  } catch (error) {
    console.error('Customer login error:', error);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

router.get('/me', authenticate, async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: publicUser((req as any).user as User) });
});

router.put('/me', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user as User;
    const { firstName, lastName, phoneNumber } = req.body || {};

    if (!firstName || !lastName || !phoneNumber) {
      res.status(400).json({ success: false, message: 'First name, last name, and phone number are required' });
      return;
    }

    const repo = AppDataSource.getRepository(User);
    user.firstName = firstName.trim();
    user.lastName = lastName.trim();
    user.phoneNumber = phoneNumber.trim();

    const saved = await repo.save(user);
    res.json({ success: true, message: 'Profile updated successfully', data: publicUser(saved) });
  } catch (error: any) {
    console.error('Customer profile update error:', error);
    res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
});

router.put('/password', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user as User;
    const { oldPassword, newPassword } = req.body || {};

    if (!oldPassword || !newPassword) {
      res.status(400).json({ success: false, message: 'Old password and new password are required' });
      return;
    }

    if (newPassword.length < 10) {
      res.status(400).json({ success: false, message: 'New password must be at least 10 characters long' });
      return;
    }

    const isMatch = await bcrypt.compare(String(oldPassword), user.passwordHash);
    if (!isMatch) {
      res.status(400).json({ success: false, message: 'Incorrect old password' });
      return;
    }

    const repo = AppDataSource.getRepository(User);
    user.passwordHash = await bcrypt.hash(String(newPassword), 12);
    await repo.save(user);

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error: any) {
    console.error('Customer password update error:', error);
    res.status(500).json({ success: false, message: 'Failed to update password' });
  }
});

router.post('/export', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user as User;

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
      AppDataSource.getRepository(PrintJob).find({ where: { userId: user.id } }),
      AppDataSource.getRepository(Payment).find({ where: { userId: user.id } }),
      AppDataSource.getRepository(Transaction)
        .createQueryBuilder('tx')
        .innerJoin('tx.wallet', 'w')
        .where('w.userId = :uid', { uid: user.id })
        .getMany(),
      AppDataSource.getRepository(File)
        .createQueryBuilder('f')
        .innerJoin('f.printJob', 'pj')
        .where('pj.userId = :uid', { uid: user.id })
        .getMany(),
      AppDataSource.getRepository(GroupSession).find({ where: { hostUserId: user.id } }),
      AppDataSource.getRepository(GroupParticipant).find({ where: { userId: user.id } }),
      AppDataSource.getRepository(Dispute).find({ where: { userId: user.id } }),
      AppDataSource.getRepository(ShopReview).find({ where: { userId: user.id } }),
      AppDataSource.getRepository(AuditLog).find({ where: { actorId: user.id } }),
    ]);

    const printJobIds = printJobs.map((pj) => pj.id);
    const printJobItems = printJobIds.length
      ? await AppDataSource.getRepository(PrintJobItem).find({
          where: { printJobId: printJobIds[0] },
        })
      : [];

    const userPrintJobItems = printJobItems.filter((pji) =>
      printJobIds.includes(pji.printJobId)
    );

    const promotions = user.tenantId
      ? await AppDataSource.getRepository(Promotion).find({ where: { tenantId: user.tenantId } })
      : [];

    const repo = AppDataSource.getRepository(User);
    const freshUser = await repo.findOne({ where: { id: user.id } });
    const { passwordHash, salt, verificationToken, resetToken, printToken, ...safeUser } = freshUser!;

    await writeAudit(req, 'customer.export', `user:${user.id}`, {
      email: user.email,
      printJobs: printJobs.length,
      transactions: transactions.length,
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="printloop-customer-export-${user.id}-${new Date()
        .toISOString()
        .slice(0, 10)}.json"`,
    );
    res.send(
      JSON.stringify(
        {
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
        },
        null,
        2,
      ),
    );
  } catch (err: any) {
    console.error('Customer export error:', err);
    res.status(500).json({ success: false, message: err?.message || 'Export failed' });
  }
});

router.delete('/me', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user as User;
    const confirmEmail = String(req.body?.confirmEmail || '').trim().toLowerCase();
    const normEmail = user.email.toLowerCase();

    if (confirmEmail !== normEmail) {
      res.status(400).json({
        success: false,
        message: `Type your email "${user.email}" to confirm account closure`,
        code: 'CONFIRM_EMAIL_MISMATCH',
      });
      return;
    }

    if (user.isBlocked) {
      res.status(409).json({ success: false, message: 'Account already closed' });
      return;
    }

    user.isBlocked = true;
    await AppDataSource.getRepository(User).save(user);

    await writeAudit(req, 'customer.close', `user:${user.id}`, {
      email: user.email,
    });

    res.json({
      success: true,
      message:
        'Account closed. 30-day cooling-off window started. Contact support to reverse, otherwise data will be deleted.',
      data: { id: user.id, status: 'CLOSED' },
    });
  } catch (err: any) {
    console.error('Customer close error:', err);
    res.status(500).json({ success: false, message: err?.message || 'Close failed' });
  }
});

export default router;
