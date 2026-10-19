import { Router, type Request, type Response } from 'express';
import { AppDataSource } from '../config/database';
import { TenantBranding } from '../entities/tenantBranding.entity';
import { Tenant } from '../entities/tenant.entity';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    let tenant = req.tenant;
    if (!tenant) {
      tenant = (await AppDataSource.getRepository(Tenant).findOne({
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
  } catch (err: any) {
    console.error('Public branding read error:', err);
    res
      .status(500)
      .json({ success: false, message: err?.message || 'Failed to load branding' });
  }
});

export default router;
