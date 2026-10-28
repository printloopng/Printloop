import { Config } from '@/config';
import { Request, Response, NextFunction } from 'express';
import { User, UserRole } from '@/database/entities/user.entity';
import { isPlatformStaff } from '@/common/middleware/impersonation';

export const requirePlatformAdmin = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const user = (req as any).user as User | undefined;
  if (!user) {
    res
      .status(401)
      .json({ success: false, message: 'Authentication required' });
    return;
  }
  if (user.role !== UserRole.SUPER_ADMIN || !isPlatformStaff(req)) {
    res.status(403).json({
      success: false,
      message: 'Platform admin access required',
      code: 'NOT_PLATFORM_ADMIN',
    });
    return;
  }
  const require2fa = Config.nodeEnv === 'production' && Config.platformRequire2fa;
  if (require2fa && !user.totpEnabled) {
    res.status(403).json({
      success: false,
      message: 'Turn on two-factor authentication to use the PrintLoop backoffice.',
      code: 'PLATFORM_2FA_REQUIRED',
    });
    return;
  }
  next();
};
