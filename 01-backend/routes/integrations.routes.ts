import { Router, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { AppDataSource } from '../config/database.js';
import { Tenant, TenantStatus } from '../entities/tenant.entity.js';
import { getJwtSecret } from '../utils/jwt.js';

const router = Router();
const HANDOFF_TTL_SECONDS = 5 * 60;

function keysMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

router.get('/lms/handoff', async (req: Request, res: Response) => {
  try {
    const slug = String(req.query.slug || '').trim().toLowerCase();
    const key = String(req.query.key || '');
    const emailRaw = String(req.query.email || '').trim().toLowerCase();
    const email = /.+@.+\..+/.test(emailRaw) ? emailRaw : undefined;

    if (!slug || !key) {
      res.status(400).json({
        success: false,
        message: 'slug and key query params are required.',
        code: 'PARAMS_REQUIRED',
      });
      return;
    }

    const tenant = await AppDataSource.getRepository(Tenant).findOne({ where: { slug } });
    if (
      !tenant ||
      tenant.status !== TenantStatus.ACTIVE ||
      !tenant.lmsKey ||
      !keysMatch(tenant.lmsKey, key)
    ) {
      res.status(401).json({
        success: false,
        message: 'LMS link is not valid for this shop.',
        code: 'LMS_KEY_INVALID',
      });
      return;
    }

    const token = jwt.sign(
      {
        kind: 'handoff',
        tenantSlug: tenant.slug,
        ...(email ? { email } : {}),
        jti: randomBytes(12).toString('hex'),
      },
      getJwtSecret(),
      { expiresIn: HANDOFF_TTL_SECONDS },
    );

    const frontend = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
    const url =
      `${frontend}/auth/login?slug=${encodeURIComponent(tenant.slug)}` +
      `&handoff=${encodeURIComponent(token)}`;

    if (String(req.query.format || '') === 'json') {
      res.json({ success: true, data: { url, token, expiresIn: HANDOFF_TTL_SECONDS } });
      return;
    }
    res.redirect(302, url);
  } catch (err: any) {
    console.error('[integrations/lms] handoff error:', err?.message);
    res.status(500).json({ success: false, message: 'Could not start LMS handoff.' });
  }
});

export default router;
