import bcrypt from 'bcryptjs';
import { appUrls } from '@/core/utils/appUrls';
import { randomInt } from 'node:crypto';
import { repos } from '@/config/repos';
import { User } from '@/database/entities/user.entity';
import { Permission } from '@/common/middleware/rbac.middleware';
import { EmailService } from '@/core/services/email.service';

const RESERVED_SLUGS = new Set<string>([
  'admin',
  'api',
  'app',
  'www',
  'mail',
  'console',
  'platform',
  'support',
  'help',
  'docs',
  'status',
  'blog',
  'about',
  'pricing',
  'login',
  'signup',
  'auth',
  'dashboard',
]);

const SLUG_RE = /^[a-z][a-z0-9-]{1,28}[a-z0-9]$/;

const OWNER_PRIVILEGES: string[] = Object.values(Permission).filter(
  (p) => p !== Permission.SUPER_ADMIN,
);

export class SlugUnavailableError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'SlugUnavailableError';
  }
}
export class EmailTakenError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'EmailTakenError';
  }
}
export class ValidationError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'ValidationError';
  }
}

export interface SignupInput {
  businessName: string;
  slug: string;
  ownerFirstName: string;
  ownerLastName: string;
  ownerEmail: string;
  ownerPhone: string;
  ownerPassword: string;
  
  address?: string;
}

export interface SignupResult {
  tenantId: string;
  tenantSlug: string;
  ownerUserId: string;
  ownerEmail: string;
  
  loginUrl: string;
}

export async function signupTenant(input: SignupInput): Promise<SignupResult> {
  validate(input);

  const slug = input.slug.toLowerCase().trim();
  if (RESERVED_SLUGS.has(slug)) {
    throw new SlugUnavailableError(`'${slug}' is reserved`);
  }

  const email = input.ownerEmail.toLowerCase().trim();
  let initialAddress: string | null = null;
  let initialLat: number | null = null;
  let initialLng: number | null = null;
  if (input.address && input.address.trim()) {
    initialAddress = input.address.trim();
    try {
      const { getGeocoder } = await import(
        '@/modules/public/services/geocoding.service'
      );
      const coords = await getGeocoder().geocode(initialAddress);
      if (coords) {
        initialLat = coords.lat;
        initialLng = coords.lng;
      }
    } catch (err) {
      console.warn('[signup] geocode threw, continuing:', err);
    }
  }

  const passwordHash = await bcrypt.hash(input.ownerPassword, 12);
  const verificationToken = generateVerificationToken();

  let tenant;
  let owner;
  try {
    ({ tenant, owner } = await repos.tenant().signupTenantRecords({
      businessName: input.businessName.trim(),
      slug,
      ownerFirstName: input.ownerFirstName.trim(),
      ownerLastName: input.ownerLastName.trim(),
      ownerEmail: email,
      ownerPhone: input.ownerPhone.trim(),
      passwordHash,
      verificationToken,
      adminPrivileges: OWNER_PRIVILEGES,
      initialAddress,
      initialLat,
      initialLng,
      commissionPct: Number(process.env.COMMISSION_PCT_DEFAULT || 0.1),
    }));
  } catch (err: any) {
    if (err?.message === 'SLUG_TAKEN') {
      throw new SlugUnavailableError(`'${slug}' is already taken`);
    }
    if (err?.message === 'EMAIL_TAKEN') {
      throw new EmailTakenError(
        `${email} is already in use by another administrator`,
      );
    }
    throw err;
  }

  const loginUrl = `${appUrls.shop}/login`;
  const verifyUrl = buildVerifyUrl(owner.email, verificationToken);

  process.nextTick(() => {
    const mailer = new EmailService();
    mailer
      .sendTenantOwnerVerification({
        to: owner.email,
        firstName: owner.firstName,
        businessName: tenant.name,
        token: verificationToken,
        verifyUrl,
      })
      .catch((err) =>
        console.error(
          `[onboarding] verification email send failed for ${owner.email}:`,
          err,
        ),
      );

    if (owner.phoneNumber) {
      import('@/core/services/sms.service')
        .then(({ SMSService }) => {
          const sms = new SMSService();
          return sms.sendOTP(owner.phoneNumber, verificationToken);
        })
        .catch((err) =>
          console.error(
            `[onboarding] verification SMS send failed for ${owner.phoneNumber}:`,
            err,
          ),
        );
    }
  });

  return {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    ownerUserId: owner.id,
    ownerEmail: owner.email,
    loginUrl,
  };
}

export async function verifyOwnerEmail(opts: {
  token: string;
  email?: string;
}): Promise<{ verified: boolean; userId?: string; tenantSlug?: string }> {
  if (!opts.token) {
    throw new ValidationError('token is required');
  }
  const userRepo = repos.user();
  const tenantRepo = repos.tenant();

  const where: { verificationToken: string; email?: string } = {
    verificationToken: opts.token,
  };
  if (opts.email) where.email = opts.email.toLowerCase().trim();
  const user = await userRepo.findOne({ where });
  if (!user) {
    return { verified: false };
  }
  if (!user.isEmailVerified) {
    user.isEmailVerified = true;
    user.verificationToken = null as unknown as string;
    await userRepo.save(user);
  }
  let tenantSlug: string | undefined;
  if (user.tenantId) {
    const tenant = await tenantRepo.findOne({ where: { id: user.tenantId } });
    tenantSlug = tenant?.slug;
  }
  return { verified: true, userId: user.id, tenantSlug };
}

export async function resendOwnerVerification(opts: {
  email: string;
  tenantSlug?: string;
}): Promise<{ sent: boolean }> {
  const userRepo = repos.user();
  const tenantRepo = repos.tenant();

  const email = opts.email.toLowerCase().trim();
  let tenantId: string | null = null;
  if (opts.tenantSlug) {
    const tenant = await tenantRepo.findOne({
      where: { slug: opts.tenantSlug },
    });
    tenantId = tenant?.id ?? null;
  }
  const where: any = { email };
  if (tenantId) where.tenantId = tenantId;
  const user = await userRepo.findOne({ where });
  if (!user) return { sent: false };
  if (user.isEmailVerified) return { sent: false };

  const newToken = generateVerificationToken();
  user.verificationToken = newToken;
  await userRepo.save(user);

  const tenant = user.tenantId
    ? await tenantRepo.findOne({ where: { id: user.tenantId } })
    : null;
  const verifyUrl = buildVerifyUrl(user.email, newToken);

  const mailer = new EmailService();
  await mailer.sendTenantOwnerVerification({
    to: user.email,
    firstName: user.firstName,
    businessName: tenant?.name || 'PrintLoop',
    token: newToken,
    verifyUrl,
  });

  if (user.phoneNumber) {
    try {
      const { SMSService } = await import('@/core/services/sms.service');
      const sms = new SMSService();
      await sms.sendOTP(user.phoneNumber, newToken);
    } catch (smsErr) {
      console.error(
        `[onboarding] resend verification SMS failed for ${user.phoneNumber}:`,
        smsErr,
      );
    }
  }

  return { sent: true };
}

function generateVerificationToken(): string {
  return String(randomInt(100_000, 1_000_000));
}

function buildVerifyUrl(email: string, token: string): string {
  return `${appUrls.shop}/verify-email?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
}

function validate(input: SignupInput): void {
  const missing: string[] = [];
  const required: Array<[keyof SignupInput, string]> = [
    ['businessName', 'businessName'],
    ['slug', 'slug'],
    ['ownerFirstName', 'ownerFirstName'],
    ['ownerLastName', 'ownerLastName'],
    ['ownerEmail', 'ownerEmail'],
    ['ownerPhone', 'ownerPhone'],
    ['ownerPassword', 'ownerPassword'],
  ];
  for (const [key, label] of required) {
    if (!input[key] || !String(input[key]).trim()) missing.push(label);
  }
  if (missing.length) {
    throw new ValidationError(`Missing required fields: ${missing.join(', ')}`);
  }
  if (!SLUG_RE.test(input.slug.toLowerCase().trim())) {
    throw new ValidationError(
      "Slug must be 3–30 chars, lowercase a–z / 0–9 / dashes, starting with a letter",
    );
  }
  if (input.ownerPassword.length < 10) {
    throw new ValidationError('Password must be at least 10 characters');
  }
  if (!/.+@.+\..+/.test(input.ownerEmail)) {
    throw new ValidationError('Invalid email address');
  }
}

