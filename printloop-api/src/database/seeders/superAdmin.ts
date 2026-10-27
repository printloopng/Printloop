import bcrypt from 'bcryptjs';
import { AppDataSource } from '@/config/data-source';
import { User, UserRole } from '@/database/entities/user.entity';

export const MIN_STAFF_PASSWORD_LENGTH = 10;

export interface SuperAdminInput {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  resetPassword?: boolean;
}

export type SuperAdminResult =
  | { outcome: 'created' | 'updated' | 'unchanged'; userId: string }
  | { outcome: 'refused'; userId: string; role: string };

export class SuperAdminInputError extends Error {}

export async function ensureSuperAdmin(input: SuperAdminInput): Promise<SuperAdminResult> {
  const email = input.email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new SuperAdminInputError(`Invalid email: ${input.email}`);
  if (input.password.length < MIN_STAFF_PASSWORD_LENGTH) {
    throw new SuperAdminInputError(`Password must be at least ${MIN_STAFF_PASSWORD_LENGTH} characters. Pick something stronger.`);
  }

  const repo = AppDataSource.getRepository(User);
  const existing = await repo.findOne({ where: { email } });

  if (existing) {
    if (!input.resetPassword) {
      return existing.role === UserRole.SUPER_ADMIN
        ? { outcome: 'unchanged', userId: existing.id }
        : { outcome: 'refused', userId: existing.id, role: existing.role };
    }
    existing.passwordHash = await bcrypt.hash(input.password, 12);
    existing.salt = 'bcrypt';
    existing.role = UserRole.SUPER_ADMIN;
    existing.tenantId = null;
    existing.isEmailVerified = true;
    existing.isBlocked = false;
    existing.blockReason = null as any;
    const saved = await repo.save(existing);
    return { outcome: 'updated', userId: saved.id };
  }

  const created = await repo.save(
    repo.create({
      tenantId: null,
      firstName: input.firstName?.trim() || 'Platform',
      lastName: input.lastName?.trim() || 'Admin',
      email,
      phoneNumber: '',
      passwordHash: await bcrypt.hash(input.password, 12),
      salt: 'bcrypt',
      isEmailVerified: true,
      role: UserRole.SUPER_ADMIN,
      adminPrivileges: [],
    }),
  );
  return { outcome: 'created', userId: created.id };
}
