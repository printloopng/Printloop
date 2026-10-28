import { Config } from '@/config';
import { type Request, type Response, type NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { mintToken, parseToken, secretsMatch } from '@/core/utils/resetToken';
import { AppDataSource } from '@/config/data-source';
import { User, UserRole } from '@/database/entities/user.entity';
import { appUrls } from '@/core/utils/appUrls';
import { EmailService } from '@/core/services/email.service';

const ANTI_ENUMERATION_OK = {
  success: true,
  message:
    'If that email is registered, a password-reset link has been sent.',
};

async function resolveTenantId(req: Request): Promise<string | null> {
  return req.tenant?.id ?? null;
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
    const user =
      (tenantId ? await userRepo.findOne({ where: { email, tenantId } }) : null) ??
      (await userRepo.findOne({ where: { email } }));

    if (user && !user.isBlocked) {
      const { token } = mintToken();
      user.resetToken = token;
      await userRepo.save(user);

      const frontendUrl =
        user.role === UserRole.SUPER_ADMIN
          ? appUrls.backoffice
          : user.role === UserRole.ADMIN
            ? appUrls.shop
            : appUrls.customer;
      const resetUrl =
        `${frontendUrl}/reset-password` +
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

      if (Config.nodeEnv !== 'production') {
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

    const userRepo = AppDataSource.getRepository(User);
    const user = (await userRepo.find({ where: { email } })).find((candidate) => {
      const stored = candidate.resetToken ? parseToken(candidate.resetToken) : null;
      return Boolean(stored && secretsMatch(stored.secret, parsed.secret));
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
