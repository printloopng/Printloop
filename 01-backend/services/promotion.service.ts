import { AppDataSource } from '../config/database';
import { Promotion } from '../entities/promotion.entity';

export interface PromotionApplyResult {
  cost: number;
  discount: number;
  code?: string;
  reason?:
    | 'not_found'
    | 'inactive'
    | 'not_started'
    | 'expired'
    | 'exhausted'
    | 'no_code';
}

export async function applyPromotion(
  baseCost: number,
  rawCode: string | undefined | null,
  opts: { pageCount?: number; perPageBw?: number } = {},
): Promise<PromotionApplyResult> {
  const cost = Math.max(0, Math.floor(Number(baseCost) || 0));
  const code = String(rawCode || '').trim().toUpperCase();
  if (!code) return { cost, discount: 0, reason: 'no_code' };

  const repo = AppDataSource.getRepository(Promotion);
  const promo = await repo.findOne({ where: { code } });
  if (!promo) return { cost, discount: 0, reason: 'not_found' };

  if (promo.status !== 'active') {
    return { cost, discount: 0, code: promo.code, reason: 'inactive' };
  }
  const now = new Date();
  if (promo.startsAt && now < new Date(promo.startsAt)) {
    return { cost, discount: 0, code: promo.code, reason: 'not_started' };
  }
  if (promo.endsAt && now > new Date(promo.endsAt)) {
    return { cost, discount: 0, code: promo.code, reason: 'expired' };
  }
  if (promo.maxUses != null && Number(promo.usageCount) >= Number(promo.maxUses)) {
    return { cost, discount: 0, code: promo.code, reason: 'exhausted' };
  }

  let discount = 0;
  const value = Number(promo.discountValue) || 0;
  if (promo.discountType === 'percentage') {
    discount = Math.floor((cost * value) / 100);
  } else if (promo.discountType === 'fixed') {
    discount = Math.floor(value);
  } else if (promo.discountType === 'free_pages') {
    const pages = Math.max(0, Number(opts.pageCount) || 0);
    const perPage =
      Number(opts.perPageBw) ||
      (pages > 0 ? Math.floor(cost / pages) : 0);
    discount = Math.min(cost, Math.floor(Math.min(value, pages) * perPage));
  }
  discount = Math.max(0, Math.min(cost, discount));
  if (discount <= 0) return { cost, discount: 0, code: promo.code };

  const result = await repo
    .createQueryBuilder()
    .update(Promotion)
    .set({ usageCount: () => 'usageCount + 1' })
    .where('id = :id AND (maxUses IS NULL OR usageCount < maxUses)', { id: promo.id })
    .execute();
  if ((result.affected ?? 0) !== 1) {
    return { cost, discount: 0, code: promo.code, reason: 'exhausted' };
  }

  const final = Math.max(0, cost - discount);
  return { cost: final, discount, code: promo.code };
}
