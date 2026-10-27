import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '@/config/data-source';
import { Kiosk, KioskStatus } from '@/database/entities/kiosk.entity';
import { Tenant, TenantStatus } from '@/database/entities/tenant.entity';

declare global {
  namespace Express {
    interface Request {
      kiosk?: Kiosk;
    }
  }
}

export const kioskAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const apiKey = req.headers['x-kiosk-key'] as string;

    if (!apiKey) {
      res.status(401).json({
        success: false,
        message: 'Authentication required. X-Kiosk-Key header missing.',
        code: 'KIOSK_AUTH_MISSING',
      });
      return;
    }

    const kioskRepository = AppDataSource.getRepository(Kiosk);
    const kiosk = await kioskRepository.findOne({
      where: { apiKey },
    });

    if (!kiosk) {
      res.status(401).json({
        success: false,
        message: 'Invalid API key. Kiosk not found.',
        code: 'KIOSK_AUTH_INVALID',
      });
      return;
    }

    if (kiosk.status === KioskStatus.DISABLED) {
      res.status(403).json({
        success: false,
        message: 'Kiosk is disabled. Contact administrator.',
        code: 'KIOSK_DISABLED',
      });
      return;
    }

    if (kiosk.status === KioskStatus.MAINTENANCE) {
      res.status(503).json({
        success: false,
        message: 'Kiosk is in maintenance mode. Please try another kiosk.',
        code: 'KIOSK_MAINTENANCE',
      });
      return;
    }

    const shop = kiosk.tenantId
      ? await AppDataSource.getRepository(Tenant).findOne({ where: { id: kiosk.tenantId }, select: { id: true, status: true } })
      : null;
    if (!shop || shop.status === TenantStatus.SUSPENDED || shop.status === TenantStatus.CLOSED) {
      res.status(403).json({
        success: false,
        message: 'The shop this kiosk belongs to is not active.',
        code: 'TENANT_INACTIVE',
      });
      return;
    }

    kiosk.lastSeenAt = new Date();
    await kioskRepository.update({ id: kiosk.id }, { lastSeenAt: kiosk.lastSeenAt });

    req.kiosk = kiosk;

    next();
  } catch (error) {
    console.error('Kiosk auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during authentication',
      code: 'KIOSK_AUTH_ERROR',
    });
  }
};
