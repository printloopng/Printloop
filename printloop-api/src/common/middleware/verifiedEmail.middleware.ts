import { Request, Response, NextFunction } from 'express';
import { User, UserRole } from '@/database/entities/user.entity';

export const requireVerifiedEmail = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const user = (req as any).user as User | undefined;
  if (!user) {
    res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
    return;
  }
  if (user.role === UserRole.SUPER_ADMIN) {
    next();
    return;
  }
  if (!user.isEmailVerified) {
    res.status(403).json({
      success: false,
      message: 'Verify your email before completing this step',
      code: 'EMAIL_NOT_VERIFIED',
    });
    return;
  }
  next();
};
