import { AppDataSource } from '@/config/data-source';
import { PricingConfig } from '@/database/entities/pricingConfig.entity';
import { EditPricingConfig } from '@/database/entities/editPricingConfig.entity';
import { Tenant } from '@/database/entities/tenant.entity';
import { conversionEnabled } from '@/modules/public/services/documentConversion.service';

const money = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function shopPriceList(tenant?: Tenant | null) {
  const resolved = tenant ?? null;
  const [rows, editing] = resolved
    ? await Promise.all([
        AppDataSource.getRepository(PricingConfig).find({ where: { tenantId: resolved.id, isActive: true } }),
        AppDataSource.getRepository(EditPricingConfig).findOne({ where: { tenantId: resolved.id } }),
      ])
    : [[], null];
  return {
    currency: 'NGN',
    floor: 5,
    tenantSlug: resolved?.slug ?? null,
    tenantName: resolved?.name ?? null,
    officeConversion: conversionEnabled(),
    editing: {
      enabled: Boolean(editing?.editingEnabled),
      baseFee: Number(editing?.baseFee ?? 0),
      perPageFee: Number(editing?.perPageFee ?? 0),
    },
    configs: rows.map((r) => ({
      paperSize: r.paperSize,
      colorType: r.colorType,
      pricePerPage: Number(r.pricePerPage),
      duplexMultiplier: Number(r.duplexMultiplier),
      highResolutionMultiplier: Number(r.highResolutionMultiplier),
      price100Simplex: money(r.price100Simplex),
      price300Simplex: money(r.price300Simplex),
      price600Simplex: money(r.price600Simplex),
      price100Duplex: money(r.price100Duplex),
      price300Duplex: money(r.price300Duplex),
      price600Duplex: money(r.price600Duplex),
    })),
  };
}
