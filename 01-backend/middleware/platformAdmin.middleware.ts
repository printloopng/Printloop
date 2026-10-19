import { Request, Response, NextFunction } from 'express';
import { User, UserRole } from '../entities/user.entity';

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
  if (user.role !== UserRole.SUPER_ADMIN) {
    res.status(403).json({
      success: false,
      message: 'Platform admin access required',
      code: 'NOT_PLATFORM_ADMIN',
    });
    return;
  }
  next();
};
