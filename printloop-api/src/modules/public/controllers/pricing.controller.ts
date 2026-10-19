import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '@/config/data-source';
import { PricingConfig } from '@/database/entities/pricingConfig.entity';
import { Tenant } from '@/database/entities/tenant.entity';

async function resolveTenantIdForRead(req: Request): Promise<string> {
  if (req.tenant?.id) return req.tenant.id;
  const tenantRow = await AppDataSource.getRepository(Tenant).findOne({
    where: { slug: 'legacy' },
  });
  return tenantRow?.id ?? '';
}

export class PublicPricingController {
  getMatrix = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = await resolveTenantIdForRead(req);
      const rows = await AppDataSource.getRepository(PricingConfig).find({
        where: { tenantId, isActive: true },
      });
      res.json({
        success: true,
        data: {
          currency: 'NGN',
          floor: 5,
          tenantSlug: req.tenant?.slug ?? null,
          configs: rows.map((r) => ({
            paperSize: r.paperSize,
            colorType: r.colorType,
            pricePerPage: Number(r.pricePerPage),
            duplexMultiplier: Number(r.duplexMultiplier),
            highResolutionMultiplier: Number(r.highResolutionMultiplier),
            price100Simplex: r.price100Simplex == null ? null : Number(r.price100Simplex),
            price300Simplex: r.price300Simplex == null ? null : Number(r.price300Simplex),
            price600Simplex: r.price600Simplex == null ? null : Number(r.price600Simplex),
            price100Duplex: r.price100Duplex == null ? null : Number(r.price100Duplex),
            price300Duplex: r.price300Duplex == null ? null : Number(r.price300Duplex),
            price600Duplex: r.price600Duplex == null ? null : Number(r.price600Duplex),
            officeConversion: r.officeConversion,
          })),
        },
      });
    } catch (err) {
      next(err);
    }
  };
}

export const publicPricingController = new PublicPricingController();
