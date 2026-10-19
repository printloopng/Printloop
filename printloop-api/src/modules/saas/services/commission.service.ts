import { Tenant } from '@/database/entities/tenant.entity';

export interface CommissionSplit {
  
  grossAmount: number;
  
  commissionAmount: number;
  
  tenantNetAmount: number;
  
  rateUsed: number;
}

export function computeCommissionSplit(
  tenant: Tenant,
  grossAmount: number,
): CommissionSplit {
  if (!Number.isFinite(grossAmount) || grossAmount <= 0) {
    throw new Error(`Invalid gross amount: ${grossAmount}`);
  }
  const rate = clampRate(Number(tenant.commissionPct));
  const commissionRaw = grossAmount * rate;
  const commissionAmount = round2(commissionRaw);
  const tenantNetAmount = round2(grossAmount - commissionAmount);
  return {
    grossAmount: round2(grossAmount),
    commissionAmount,
    tenantNetAmount,
    rateUsed: rate,
  };
}

export function commissionInKobo(split: CommissionSplit): number {
  return Math.floor(split.commissionAmount * 100);
}

export function tenantNetFromTransaction(
  grossAmount: number,
  commissionAmount: number,
): number {
  return round2(grossAmount - commissionAmount);
}

function clampRate(rate: number): number {
  if (!Number.isFinite(rate) || rate < 0) return 0;
  if (rate > 0.5) return 0.5;
  return rate;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
