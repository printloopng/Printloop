import { Config } from '@/config';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { AppDataSource } from '@/config/data-source';
import { TenantMember, TenantMemberRole } from '@/database/entities/tenantMember.entity';

export const JWT_SECRET: string = Config.jwt.secret;

export const JWT_EXPIRES_IN = Config.jwt.expiresIn;

export function getJwtSecret(): string {
  const s = Config.jwt.secret;
  if (!s || s.length < 16) {
    throw new Error(
      'JWT_SECRET is required (≥16 chars) — used to sign handoff tokens.',
    );
  }
  return s;
}

export interface JwtTenantMembership {
  tenantId: string;
  role: TenantMemberRole;
}

export interface JwtPayload {
  userId: string;
  role?: string;
  
  memberships?: JwtTenantMembership[];
  
  impersonating?: {
    tenantId: string;
    
    actorUserId: string;
  };
}

export function signAccessToken(
  payload: JwtPayload,
  options?: { expiresIn?: string | number },
): string {
  const opts: SignOptions = {
    expiresIn:
      (options?.expiresIn ?? JWT_EXPIRES_IN) as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, JWT_SECRET, opts);
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export async function loadMembershipsForUser(
  userId: string,
): Promise<JwtTenantMembership[]> {
  const rows = await AppDataSource.getRepository(TenantMember).find({
    where: { userId },
  });
  return rows.map((r) => ({ tenantId: r.tenantId, role: r.role }));
}
