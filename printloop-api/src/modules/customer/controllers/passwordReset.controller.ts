import { type Request, type Response, type NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { AppDataSource } from '@/config/data-source';
import { User } from '@/database/entities/user.entity';
import { Tenant } from '@/database/entities/tenant.entity';
import { LEGACY_TENANT_SLUG } from '@/common/middleware/tenant.middleware';
import { EmailService } from '@/core/services/email.service';

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const ANTI_ENUMERATION_OK = {
  success: true,
  message:
    'If that email is registered, a password-reset link has been sent.',
};

async function resolveTenantId(req: Request): Promise<string | null> {
  if (req.tenant?.id) return req.tenant.id;
  const legacy = await AppDataSource.getRepository(Tenant).findOne({
    where: { slug: LEGACY_TENANT_SLUG },
  });
  return legacy?.id ?? null;
}

function mintToken(): { token: string; expiresAtMs: number } {
  const secret = randomBytes(32).toString('hex');
  const expiresAtMs = Date.now() + RESET_TTL_MS;
  return { token: `${secret}.${expiresAtMs}`, expiresAtMs };
}

function parseToken(token: string): { secret: string; expiresAtMs: number } | null {
  if (typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return null;
  const secret = token.slice(0, dot);
  const expiresAtMs = Number(token.slice(dot + 1));
  if (!secret || !Number.isFinite(expiresAtMs)) return null;
  return { secret, expiresAtMs };
}

function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  return timingSafeEqual(aBuf, bBuf);
}

export class PasswordResetController {

  forgotPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const email = String((req.body || {}).email || '').trim().toLowerCase();
    if (!email || !/.+@.+\..+/.test(email)) {
      res.json(ANTI_ENUMERATION_OK);
      return;
    }
    const tenantId = await resolveTenantId(req);
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({
      where: tenantId ? { email, tenantId } : { email },
    });

    if (user && !user.isBlocked) {
      const { token } = mintToken();
      user.resetToken = token;
      await userRepo.save(user);

      const frontendUrl =
        process.env.FRONTEND_URL || 'http://localhost:5173';
      const resetUrl =
        `${frontendUrl.replace(/\/$/, '')}/reset-password` +
        `?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;

      try {
        const mailer = new EmailService();
        await mailer.sendPasswordReset({
          to: email,
          firstName: user.firstName || '',
          resetUrl,
          token,
        });
      } catch (mailErr) {
        console.error('[forgot-password] email send threw:', mailErr);
      }

      if (process.env.NODE_ENV !== 'production') {
        console.log(
          `[forgot-password] minted token for ${email}: ${token}`,
        );
      }
    }

    res.json(ANTI_ENUMERATION_OK);
  } catch (err) {
    console.error('[forgot-password] error:', err);
    res.json(ANTI_ENUMERATION_OK);
  }
};

  resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = req.body || {};
    const email = String(body.email || '').trim().toLowerCase();
    const token = String(body.token || '');
    const password = String(body.password || '');

    if (!email || !token || !password) {
      res.status(400).json({
        success: false,
        message: 'Email, token, and new password are required.',
      });
      return;
    }
    if (password.length < 10) {
      res.status(400).json({
        success: false,
        message: 'Password must be at least 10 characters.',
      });
      return;
    }
    const parsed = parseToken(token);
    if (!parsed) {
      res.status(400).json({
        success: false,
        message: 'Reset link is invalid.',
        code: 'TOKEN_MALFORMED',
      });
      return;
    }
    if (parsed.expiresAtMs < Date.now()) {
      res.status(400).json({
        success: false,
        message: 'Reset link has expired. Request a new one.',
        code: 'TOKEN_EXPIRED',
      });
      return;
    }

    const tenantId = await resolveTenantId(req);
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({
      where: tenantId ? { email, tenantId } : { email },
    });
    if (!user || !user.resetToken) {
      res.status(400).json({
        success: false,
        message: 'Reset link is invalid.',
        code: 'TOKEN_INVALID',
      });
      return;
    }
    const stored = parseToken(user.resetToken);
    if (!stored || !secretsMatch(stored.secret, parsed.secret)) {
      res.status(400).json({
        success: false,
        message: 'Reset link is invalid.',
        code: 'TOKEN_INVALID',
      });
      return;
    }

    user.passwordHash = bcrypt.hashSync(password, 12);
    user.salt = 'bcrypt';
    user.resetToken = null as any;
    await userRepo.save(user);

    res.json({
      success: true,
      message: 'Password has been reset. You can sign in with your new password.',
    });
  } catch (err) {
    console.error('[reset-password] error:', err);
    res.status(500).json({
      success: false,
      message: 'Could not reset password.',
    });
  }
};

}

export const passwordResetController = new PasswordResetController();
