import { repos } from '@/config/repos';

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
  const tenant = await repos.tenant().findOne({ where: { id: tenantId } });
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
    repos.tenantMember().find({ where: { tenantId } }),
    repos.tenantBranding().findOne({ where: { tenantId } }),
    repos.tenantBalance().findOne({ where: { tenantId } }),
    repos.user().find({ where: { tenantId } as object }),
    repos.wallet().find({ where: { tenantId } as object }),
    repos.kiosk().find({ where: { tenantId } as object }),
    repos.printJob().find({ where: { tenantId } as object }),
    repos.payment().find({ where: { tenantId } as object }),
    repos.transaction().find({ where: { tenantId } as object }),
    repos.file().find({ where: { tenantId } as object }),
    repos.pricingConfig().find({ where: { tenantId } as object }),
    repos.promotion().find({ where: { tenantId } as object }),
    repos.groupSession().find({ where: { tenantId } as object }),
    repos.payout().find({ where: { tenantId } }),
    repos.payoutSchedule().findOne({ where: { tenantId } }),
    repos.auditLog().find({ where: { tenantId } as object }),
  ]);

  const printJobItems = await repos.printJobItem().find({ where: { tenantId } as object });

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
