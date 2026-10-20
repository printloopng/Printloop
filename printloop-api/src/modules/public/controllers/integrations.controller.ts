import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { AppDataSource } from '@/config/data-source';
import { Tenant, TenantStatus } from '@/database/entities/tenant.entity';
import { getJwtSecret } from '@/core/utils/jwt';
import { appUrls } from '@/core/utils/appUrls';
import { lmsHandoffQuerySchema } from '@/modules/public/validation/integrations.validation';

const HANDOFF_TTL_SECONDS = 5 * 60;

function keysMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

export class IntegrationsController {
  lmsHandoff = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = lmsHandoffQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          message: 'slug and key query params are required.',
          code: 'PARAMS_REQUIRED',
        });
        return;
      }
      const { slug, key, email, format } = parsed.data;

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

      const url =
        `${appUrls.customer}/login?shop=${encodeURIComponent(tenant.slug)}` +
        `&handoff=${encodeURIComponent(token)}`;

      if (format === 'json') {
        res.json({ success: true, data: { url, token, expiresIn: HANDOFF_TTL_SECONDS } });
        return;
      }
      res.redirect(302, url);
    } catch (err) {
      next(err);
    }
  };
}

export const integrationsController = new IntegrationsController();
