import { repos } from "@/config/repos";

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
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const total = await repos.transaction().sumTopupAmountSince(tenantId, since);
  const used = Math.round(total * 100);
  const limit = ABUSE_LIMITS.UPLOAD_BYTES_24H;
  const resetAt = new Date();
  resetAt.setUTCHours(24, 0, 0, 0);
  return {
    allowed: used + fileSize <= limit,
    usedBytes: used,
    limitBytes: limit,
    resetAt,
  };
}

export async function recordUpload(_tenantId: string, _fileSize: number): Promise<void> {}

export async function checkPickupLimit(
  tenantId: string,
  customerUserId: string,
): Promise<PickupLimitResult> {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const attempts = await repos.printJob().countForUserSince(tenantId, customerUserId, since, [
    "READY",
    "RELEASING",
    "PRINTING",
    "PRINTED",
    "FAILED",
  ]);
  const limit = ABUSE_LIMITS.PICKUP_ATTEMPTS_PER_HOUR;
  const resetAt = new Date();
  resetAt.setMinutes(60, 0, 0);
  return { allowed: attempts < limit, attempts, limit, resetAt };
}

export async function checkCommissionHealth(
  tenantId: string,
): Promise<CommissionHealthResult> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const commission30d = await repos.transaction().sumCommissionSince(tenantId, since);
  const threshold = ABUSE_LIMITS.MIN_COMMISSION_30D;
  return {
    healthy: commission30d >= threshold,
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
