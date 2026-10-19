import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '@/config/data-source';
import { TenantBranding } from '@/database/entities/tenantBranding.entity';
import { Tenant } from '@/database/entities/tenant.entity';

export class PublicBrandingController {
  getBranding = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      let tenant = req.tenant;
      if (!tenant) {
        tenant =
          (await AppDataSource.getRepository(Tenant).findOne({
            where: { slug: 'legacy' },
          })) ?? undefined;
      }
      if (!tenant) {
        res.status(404).json({ success: false, message: 'Tenant not found' });
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
