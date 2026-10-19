import { Request, Response, NextFunction } from 'express';
import { redisClient } from '@/config/redis';
import { AppDataSource } from '@/config/data-source';
import { AuditLog } from '@/database/entities/auditLog.entity';

const MAX_ATTEMPTS = 5;
const WINDOW_SECONDS = 10 * 60;
const LOCKOUT_SECONDS = 30 * 60;

const ATTEMPT_KEY_PREFIX = 'brute:code-attempt:';
const LOCKOUT_KEY_PREFIX = 'brute:code-lockout:';

export const bruteForceProtection = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const ip = req.ip || 'unknown';
    const tid =
      (req as any).kiosk?.tenantId || req.tenant?.id || 'global';
    const lockoutKey = `${LOCKOUT_KEY_PREFIX}${tid}:${ip}`;
    const attemptKey = `${ATTEMPT_KEY_PREFIX}${tid}:${ip}`;

    const lockedUntil = await redisClient.get(lockoutKey);
    if (lockedUntil) {
      const ttl = await redisClient.ttl(lockoutKey);
      res.status(429).json({
        success: false,
        message: `Too many failed attempts. Try again in ${Math.ceil(ttl / 60)} minutes.`,
        code: 'BRUTE_FORCE_LOCKOUT',
        lockedSeconds: ttl,
      });
      return;
    }

    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      if (body && body.success === false) {
        recordFailure(tid, ip).catch(err =>
          console.error('Brute force counter error:', err)
        );
      } else if (body && body.success === true) {
        redisClient.del(attemptKey).catch(() => {});
      }
      return originalJson(body);
    };

    next();
  } catch (error) {
    console.error('Brute force middleware error:', error);
    next();
  }
};

async function recordFailure(tenantId: string, ip: string): Promise<void> {
  const attemptKey = `${ATTEMPT_KEY_PREFIX}${tenantId}:${ip}`;
  const lockoutKey = `${LOCKOUT_KEY_PREFIX}${tenantId}:${ip}`;

  const attempts = await redisClient.incr(attemptKey);
  if (attempts === 1) {
    await redisClient.expire(attemptKey, WINDOW_SECONDS);
  }

  if (attempts >= MAX_ATTEMPTS) {
    await redisClient.setEx(lockoutKey, LOCKOUT_SECONDS, '1');
    await redisClient.del(attemptKey);

    try {
      const auditRepo = AppDataSource.getRepository(AuditLog);
      await auditRepo.save(
        auditRepo.create({
          tenantId: tenantId === 'global' ? null : tenantId,
          actorName: 'system',
          action: 'BRUTE_FORCE_LOCKOUT',
          target: `ip:${ip}`,
          detail: { attempts, windowSeconds: WINDOW_SECONDS, lockoutSeconds: LOCKOUT_SECONDS },
          ipAddress: ip,
        })
      );
    } catch (err) {
      console.error('Audit log error:', err);
    }

    console.warn(`[BruteForce] IP ${ip} locked out for ${LOCKOUT_SECONDS}s after ${attempts} failures`);
  }
}
