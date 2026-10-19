import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../config/database';
import { Kiosk, KioskStatus } from '../entities/kiosk.entity';

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

    kiosk.lastSeenAt = new Date();
    await kioskRepository.save(kiosk);

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
