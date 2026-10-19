import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '@/config/data-source';
import { User } from '@/database/entities/user.entity';
import { verifyToken, type JwtTenantMembership } from '@/core/utils/jwt';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      
      tenantMemberships?: JwtTenantMembership[];
    }
  }
}

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const header = req.header('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';

    if (!token) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      res.status(401).json({ success: false, message: 'Invalid or expired token' });
      return;
    }

    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { id: payload.userId } });

    if (!user) {
      res.status(401).json({ success: false, message: 'User no longer exists' });
      return;
    }

    if (user.isBlocked) {
      res.status(403).json({ success: false, message: 'Account is blocked' });
      return;
    }

    (req as any).user = user;
    req.tenantMemberships = Array.isArray(payload.memberships)
      ? payload.memberships
      : [];
    if (payload.impersonating?.actorUserId) {
      (req as any).impersonatingActorUserId =
        payload.impersonating.actorUserId;
    }
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ success: false, message: 'Authentication failed' });
  }
};

export const optionalAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const header = req.header('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return next();

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      return next();
    }

    const user = await AppDataSource.getRepository(User).findOne({
      where: { id: payload.userId },
    });
    if (user && !user.isBlocked) {
      (req as any).user = user;
      req.tenantMemberships = Array.isArray(payload.memberships)
        ? payload.memberships
        : [];
    }
    next();
  } catch {
    next();
  }
};
