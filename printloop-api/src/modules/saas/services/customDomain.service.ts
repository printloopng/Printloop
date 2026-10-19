import crypto from 'node:crypto';
import { promises as dns } from 'node:dns';
import { repos } from '@/config/repos';
import { DomainStatus } from '@/database/entities/tenantDomain.entity';

const TXT_PREFIX = '_printloop-verify';
const DOMAIN_RE =
  /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

export class DomainError extends Error {
  constructor(
    msg: string,
    public code: string,
    public httpStatus = 400,
  ) {
    super(msg);
    this.name = 'DomainError';
  }
}

function normalizeDomain(input: string): string {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '');
}

export async function claimDomain(
  tenantId: string,
  rawDomain: string,
): Promise<{ row: import('@/database/entities/tenantDomain.entity').TenantDomain; txtRecord: { name: string; value: string }; cname: string }> {
  const domain = normalizeDomain(rawDomain);
  if (!DOMAIN_RE.test(domain)) {
    throw new DomainError(
      `"${rawDomain}" is not a valid domain`,
      'INVALID_DOMAIN',
    );
  }
  const ourApexes = (process.env.PRINTLOOP_APEX_DOMAINS || 'printloop.app,printloop.test')
    .split(',')
    .map((s) => s.trim().toLowerCase());
  if (ourApexes.some((apex) => domain === apex || domain.endsWith('.' + apex))) {
    throw new DomainError(
      `${domain} is a PrintLoop-owned domain; use a subdomain instead`,
      'RESERVED_DOMAIN',
    );
  }

  const repo = repos.tenantDomain();
  const existing = await repo.findOne({ where: { domain } });
  if (existing && existing.tenantId !== tenantId) {
    throw new DomainError(
      `${domain} is already claimed by another tenant`,
      'DOMAIN_TAKEN',
      409,
    );
  }

  let row = existing;
  if (!row) {
    row = repo.create({ tenantId, domain });
  }
  if (row.status !== DomainStatus.VERIFIED) {
    row.verificationToken = crypto.randomBytes(24).toString('base64url');
    row.status = DomainStatus.PENDING;
    row.lastCheckError = null;
  }
  row = await repo.save(row);

  return {
    row,
    txtRecord: {
      name: `${TXT_PREFIX}.${domain}`,
      value: row.verificationToken,
    },
    cname: process.env.PRINTLOOP_DOMAINS_CNAME || 'domains.printloop.app',
  };
}

export async function verifyDomain(
  tenantId: string,
  domainId: string,
): Promise<{ verified: boolean; reason?: string }> {
  const repo = repos.tenantDomain();
  const row = await repo.findOne({ where: { id: domainId, tenantId } });
  if (!row) {
    throw new DomainError('Domain claim not found', 'NOT_FOUND', 404);
  }

  row.lastCheckedAt = new Date();
  const fqdn = `${TXT_PREFIX}.${row.domain}`;
  let txtValues: string[] = [];
  try {
    const records = await dns.resolveTxt(fqdn);
    txtValues = records.map((chunks) => chunks.join(''));
  } catch (err: any) {
    row.status = DomainStatus.FAILED;
    row.lastCheckError =
      err?.code === 'ENOTFOUND' || err?.code === 'ENODATA'
        ? `No TXT record found at ${fqdn}`
        : `DNS lookup error: ${err?.code || err?.message}`;
    await repo.save(row);
    return { verified: false, reason: row.lastCheckError };
  }

  if (!txtValues.includes(row.verificationToken)) {
    row.status = DomainStatus.FAILED;
    row.lastCheckError = `TXT record at ${fqdn} did not match the expected token`;
    await repo.save(row);
    return { verified: false, reason: row.lastCheckError };
  }

  row.status = DomainStatus.VERIFIED;
  row.verifiedAt = new Date();
  row.lastCheckError = null;
  await repo.save(row);

  const tenantRepo = repos.tenant();
  const tenant = await tenantRepo.findOne({ where: { id: tenantId } });
  if (tenant) {
    tenant.customDomain = row.domain;
    await tenantRepo.save(tenant);
  }
  return { verified: true };
}

export async function listDomains(tenantId: string) {
  return repos.tenantDomain().find({
    where: { tenantId },
    order: { createdAt: 'DESC' },
  });
}

export async function removeDomain(
  tenantId: string,
  domainId: string,
): Promise<void> {
  const repo = repos.tenantDomain();
  const row = await repo.findOne({ where: { id: domainId, tenantId } });
  if (!row) throw new DomainError('Domain claim not found', 'NOT_FOUND', 404);
  await repo.remove(row);

  const tenantRepo = repos.tenant();
  const tenant = await tenantRepo.findOne({ where: { id: tenantId } });
  if (tenant && tenant.customDomain === row.domain) {
    tenant.customDomain = null;
    await tenantRepo.save(tenant);
  }
}
