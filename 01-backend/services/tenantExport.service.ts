import { AppDataSource } from '../config/database';
import { Tenant } from '../entities/tenant.entity';
import { TenantMember } from '../entities/tenantMember.entity';
import { TenantBranding } from '../entities/tenantBranding.entity';
import { TenantBalance } from '../entities/tenantBalance.entity';
import { User } from '../entities/user.entity';
import { Wallet } from '../entities/wallet.entity';
import { Kiosk } from '../entities/kiosk.entity';
import { PrintJob } from '../entities/printJob.entity';
import { PrintJobItem } from '../entities/printJobItem.entity';
import { Payment } from '../entities/payment.entity';
import { Transaction } from '../entities/transaction.entity';
import { File } from '../entities/file.entity';
import { PricingConfig } from '../entities/pricingConfig.entity';
import { Promotion } from '../entities/promotion.entity';
import { GroupSession } from '../entities/groupSession.entity';
import { Payout } from '../entities/payout.entity';
import { PayoutSchedule } from '../entities/payoutSchedule.entity';
import { AuditLog } from '../entities/auditLog.entity';

const SENSITIVE_USER_FIELDS = [
  'passwordHash',
  'salt',
  'verificationToken',
  'resetToken',
  'printToken',
] as const;

function scrubUser(u: any): any {
  if (!u) return u;
  const copy = { ...u };
  for (const f of SENSITIVE_USER_FIELDS) delete copy[f];
  return copy;
}

export interface TenantExport {
  schemaVersion: 1;
  exportedAt: string;
  tenant: any;
  tenantMembers: any[];
  tenantBranding: any | null;
  tenantBalance: any | null;
  users: any[];
  wallets: any[];
  kiosks: any[];
  printJobs: any[];
  printJobItems: any[];
  payments: any[];
  transactions: any[];
  files: any[];
  pricingConfigs: any[];
  promotions: any[];
  groupSessions: any[];
  payouts: any[];
  payoutSchedule: any | null;
  auditLogs: any[];
}

export async function exportTenant(tenantId: string): Promise<TenantExport> {
  const ds = AppDataSource;

  const tenant = await ds.getRepository(Tenant).findOne({ where: { id: tenantId } });
  if (!tenant) throw new Error(`Tenant ${tenantId} not found`);

  const [
    tenantMembers,
    tenantBranding,
    tenantBalance,
    users,
    wallets,
    kiosks,
    printJobs,
    payments,
    transactions,
    files,
    pricingConfigs,
    promotions,
    groupSessions,
    payouts,
    payoutSchedule,
    auditLogs,
  ] = await Promise.all([
    ds.getRepository(TenantMember).find({ where: { tenantId } }),
    ds.getRepository(TenantBranding).findOne({ where: { tenantId } }),
    ds.getRepository(TenantBalance).findOne({ where: { tenantId } }),
    ds.getRepository(User).find({ where: { tenantId } as any }),
    ds.getRepository(Wallet).find({ where: { tenantId } as any }),
    ds.getRepository(Kiosk).find({ where: { tenantId } as any }),
    ds.getRepository(PrintJob).find({ where: { tenantId } as any }),
    ds.getRepository(Payment).find({ where: { tenantId } as any }),
    ds.getRepository(Transaction).find({ where: { tenantId } as any }),
    ds.getRepository(File).find({ where: { tenantId } as any }),
    ds.getRepository(PricingConfig).find({ where: { tenantId } as any }),
    ds.getRepository(Promotion).find({ where: { tenantId } as any }),
    ds.getRepository(GroupSession).find({ where: { tenantId } as any }),
    ds.getRepository(Payout).find({ where: { tenantId } }),
    ds.getRepository(PayoutSchedule).findOne({ where: { tenantId } }),
    ds.getRepository(AuditLog).find({ where: { tenantId } as any }),
  ]);

  const printJobItems = await ds
    .getRepository(PrintJobItem)
    .find({ where: { tenantId } as any });

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    tenant,
    tenantMembers,
    tenantBranding,
    tenantBalance,
    users: users.map(scrubUser),
    wallets,
    kiosks,
    printJobs,
    printJobItems,
    payments,
    transactions,
    files,
    pricingConfigs,
    promotions,
    groupSessions,
    payouts,
    payoutSchedule,
    auditLogs,
  };
}
