import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '@/config/data-source';
import { TenantBranding } from '@/database/entities/tenantBranding.entity';

export class PublicBrandingController {
  getBranding = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenant = req.tenant;
      if (!tenant) {
        res.json({ success: true, data: { tenant: null, branding: null } });
        return;
      }
      const branding = await AppDataSource.getRepository(TenantBranding).findOne({
        where: { tenantId: tenant.id },
      });
      res.json({
        success: true,
        data: {
          tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
          branding: branding ?? null,
        },
      });
    } catch (err) {
      next(err);
    }
  };
}

export const publicBrandingController = new PublicBrandingController();
