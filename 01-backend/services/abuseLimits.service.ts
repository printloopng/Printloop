import { AppDataSource } from '../config/database';
import { Transaction, TransactionType } from '../entities/transaction.entity';
import { PrintJob } from '../entities/printJob.entity';

export const ABUSE_LIMITS = {
  UPLOAD_BYTES_24H: 5 * 1024 * 1024 * 1024,

  PICKUP_ATTEMPTS_PER_HOUR: 30,

  MIN_COMMISSION_30D: 0,

  MAX_FILE_SIZE: 50 * 1024 * 1024,
} as const;

export interface UploadLimitResult {
  allowed: boolean;
  usedBytes: number;
  limitBytes: number;
  resetAt: Date;
}

export interface PickupLimitResult {
  allowed: boolean;
  attempts: number;
  limit: number;
  resetAt: Date;
}

export interface CommissionHealthResult {
  healthy: boolean;
  commission30d: number;
  threshold: number;
}

export async function checkUploadLimit(
  tenantId: string,
  fileSize: number,
): Promise<UploadLimitResult> {
  const uploadRepo = AppDataSource.getRepository(Transaction);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const row = await uploadRepo
    .createQueryBuilder('tx')
    .select(
      `COALESCE(SUM(CAST(tx.amount AS REAL)), 0)`,
      'total',
    )
    .where('tx.tenantId = :tid', { tid: tenantId })
    .andWhere('tx.createdAt >= :since', { since })
    .andWhere('tx.type = :type', { type: TransactionType.TOPUP })
    .getRawOne<{ total: string }>();

  const used = Math.round(row ? Number(row.total) * 100 : 0);
  const limit = ABUSE_LIMITS.UPLOAD_BYTES_24H;
  const allowed = used + fileSize <= limit;

  const resetAt = new Date();
  resetAt.setUTCHours(24, 0, 0, 0);

  return {
    allowed,
    usedBytes: used,
    limitBytes: limit,
    resetAt,
  };
}

export async function recordUpload(tenantId: string, fileSize: number): Promise<void> {
}

export async function checkPickupLimit(
  tenantId: string,
  customerUserId: string,
): Promise<PickupLimitResult> {
  const jobRepo = AppDataSource.getRepository(PrintJob);
  const since = new Date(Date.now() - 60 * 60 * 1000);

  const attempts = await jobRepo
    .createQueryBuilder('pj')
    .where('pj.tenantId = :tid', { tid: tenantId })
    .andWhere('pj.userId = :uid', { uid: customerUserId })
    .andWhere('pj.createdAt >= :since', { since })
    .andWhere('pj.status IN (:...statuses)', {
      statuses: ['READY', 'RELEASING', 'PRINTING', 'PRINTED', 'FAILED'],
    })
    .getCount();

  const limit = ABUSE_LIMITS.PICKUP_ATTEMPTS_PER_HOUR;
  const allowed = attempts < limit;

  const resetAt = new Date();
  resetAt.setMinutes(60, 0, 0);

  return {
    allowed,
    attempts,
    limit,
    resetAt,
  };
}

export async function checkCommissionHealth(
  tenantId: string,
): Promise<CommissionHealthResult> {
  const txRepo = AppDataSource.getRepository(Transaction);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const row = await txRepo
    .createQueryBuilder('tx')
    .select(
      `COALESCE(SUM(CAST(tx.commissionAmount AS REAL)), 0)`,
      'total',
    )
    .where('tx.tenantId = :tid', { tid: tenantId })
    .andWhere('tx.createdAt >= :since', { since })
    .getRawOne<{ total: string }>();

  const commission30d = row ? Number(row.total) : 0;
  const threshold = ABUSE_LIMITS.MIN_COMMISSION_30D;
  const healthy = commission30d >= threshold;

  return {
    healthy,
    commission30d,
    threshold,
  };
}

export function validateFileSize(fileSize: number): { valid: boolean; message?: string } {
  if (fileSize > ABUSE_LIMITS.MAX_FILE_SIZE) {
    return {
      valid: false,
      message: `File size ${(fileSize / 1024 / 1024).toFixed(1)} MB exceeds ${ABUSE_LIMITS.MAX_FILE_SIZE / 1024 / 1024} MB limit`,
    };
  }
  return { valid: true };
}