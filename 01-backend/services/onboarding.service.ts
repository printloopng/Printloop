import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { AppDataSource } from '../config/database';
import { Tenant, TenantStatus } from '../entities/tenant.entity';
import { TenantMember, TenantMemberRole } from '../entities/tenantMember.entity';
import { User, UserRole } from '../entities/user.entity';
import { Permission } from '../middleware/rbac.middleware';
import { Wallet } from '../entities/wallet.entity';
import { PayoutSchedule, PayoutCadence } from '../entities/payoutSchedule.entity';
import { PricingConfig, PaperSize, ColorType } from '../entities/pricingConfig.entity';
import { Kiosk, KioskStatus } from '../entities/kiosk.entity';
import { LEGACY_TENANT_SLUG } from '../middleware/tenant.middleware';
import { EmailService } from './email.service';

const RESERVED_SLUGS = new Set<string>([
  LEGACY_TENANT_SLUG,
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

  return AppDataSource.transaction(async (em) => {
    const existingSlug = await em.findOne(Tenant, { where: { slug } });
    if (existingSlug) {
      throw new SlugUnavailableError(`'${slug}' is already taken`);
    }

    const email = input.ownerEmail.toLowerCase().trim();
    const existingOwnerByEmail = await em
      .createQueryBuilder(User, 'u')
      .where('LOWER(u.email) = :email', { email })
      .andWhere('u.role IN (:...roles)', {
        roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
      })
      .getOne();
    if (existingOwnerByEmail) {
      throw new EmailTakenError(
        `${email} is already in use by another administrator`,
      );
    }

    let initialAddress: string | null = null;
    let initialLat: number | null = null;
    let initialLng: number | null = null;
    if (input.address && input.address.trim()) {
      initialAddress = input.address.trim();
      try {
        const { getGeocoder } = await import('./geocoding.service.js');
        const coords = await getGeocoder().geocode(initialAddress);
        if (coords) {
          initialLat = coords.lat;
          initialLng = coords.lng;
        }
      } catch (err) {
        console.warn('[signup] geocode threw, continuing:', err);
      }
    }

    const tenant = await em.save(
      em.create(Tenant, {
        name: input.businessName.trim(),
        slug,
        customDomain: null,
        status: TenantStatus.TRIAL,
        commissionPct: Number(
          process.env.COMMISSION_PCT_DEFAULT || 0.1,
        ),
        paystackSubaccountCode: null,
        suspendedAt: null,
        suspendReason: null,
        address: initialAddress,
        lat: initialLat,
        lng: initialLng,
        isDiscoverable: false,
      }),
    );

    const passwordHash = await bcrypt.hash(input.ownerPassword, 12);
    const verificationToken = generateVerificationToken();
    const owner = await em.save(
      em.create(User, {
        tenantId: tenant.id,
        firstName: input.ownerFirstName.trim(),
        lastName: input.ownerLastName.trim(),
        email,
        phoneNumber: input.ownerPhone.trim(),
        passwordHash,
        salt: 'bcrypt',
        isEmailVerified: false,
        verificationToken,
        role: UserRole.ADMIN,
        adminPrivileges: OWNER_PRIVILEGES as any,
      }),
    );

    await em.save(
      em.create(TenantMember, {
        tenantId: tenant.id,
        userId: owner.id,
        role: TenantMemberRole.OWNER,
      }),
    );

    await em.save(
      em.create(Wallet, {
        tenantId: tenant.id,
        userId: owner.id,
        balance: 0,
      }),
    );

    await em.save(
      em.create(PayoutSchedule, {
        tenantId: tenant.id,
        cadence: PayoutCadence.WEEKLY,
        dayOfWeek: 5,
        minPayoutAmount: 5000,
      }),
    );

    await seedDefaultPricing(em, tenant.id);

    await em.save(
      em.create(Kiosk, {
        tenantId: tenant.id,
        name: 'Main Kiosk',
        location: tenant.address || undefined,
        printerName: 'HP LaserJet Pro',
        status: KioskStatus.ACTIVE,
      }),
    );

    const loginUrl = buildLoginUrl(tenant.slug);
    const verifyUrl = buildVerifyUrl(tenant.slug, verificationToken);

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
        import('./sms.service')
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
  });
}

export async function verifyOwnerEmail(opts: {
  token: string;
  email?: string;
}): Promise<{ verified: boolean; userId?: string; tenantSlug?: string }> {
  if (!opts.token) {
    throw new ValidationError('token is required');
  }
  const userRepo = AppDataSource.getRepository(User);
  const tenantRepo = AppDataSource.getRepository(Tenant);

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
  const userRepo = AppDataSource.getRepository(User);
  const tenantRepo = AppDataSource.getRepository(Tenant);

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
  const verifyUrl = tenant
    ? buildVerifyUrl(tenant.slug, newToken)
    : `https://printloop.app/verify-email?token=${newToken}`;

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
      const { SMSService } = await import('./sms.service.js');
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

function buildVerifyUrl(slug: string, token: string): string {
  const apex = (process.env.PRINTLOOP_APEX_DOMAINS || 'printloop.app')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)[0];
  return `https://${slug}.${apex}/verify-email?token=${token}`;
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

async function seedDefaultPricing(
  em: import('typeorm').EntityManager,
  tenantId: string,
): Promise<void> {
  const DEFAULT_CELLS: Array<{
    paper: PaperSize;
    color: ColorType;
    p100Sx: number;
    p300Sx: number;
    p600Sx: number;
    p100Dx: number;
    p300Dx: number;
    p600Dx: number;
  }> = [
    { paper: PaperSize.A4, color: ColorType.BLACK_WHITE, p100Sx: 50,  p300Sx: 70,  p600Sx: 100, p100Dx: 65,  p300Dx: 90,  p600Dx: 120 },
    { paper: PaperSize.A4, color: ColorType.COLOR,       p100Sx: 100, p300Sx: 200, p600Sx: 300, p100Dx: 150, p300Dx: 250, p600Dx: 350 },
    { paper: PaperSize.A3, color: ColorType.BLACK_WHITE, p100Sx: 100, p300Sx: 150, p600Sx: 300, p100Dx: 150, p300Dx: 230, p600Dx: 400 },
    { paper: PaperSize.A3, color: ColorType.COLOR,       p100Sx: 250, p300Sx: 400, p600Sx: 650, p100Dx: 390, p300Dx: 400, p600Dx: 650 },
  ];
  for (const cell of DEFAULT_CELLS) {
    await em.save(
      em.create(PricingConfig, {
        tenantId,
        paperSize: cell.paper,
        colorType: cell.color,
        pricePerPage: cell.p300Sx,
        duplexMultiplier: 1,
        highResolutionMultiplier: 1,
        price100Simplex: cell.p100Sx,
        price300Simplex: cell.p300Sx,
        price600Simplex: cell.p600Sx,
        price100Duplex: cell.p100Dx,
        price300Duplex: cell.p300Dx,
        price600Duplex: cell.p600Dx,
        isActive: true,
        currency: 'NGN',
      }),
    );
  }
}

function buildLoginUrl(slug: string): string {
  const apex = (process.env.PRINTLOOP_APEX_DOMAINS || 'printloop.app')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)[0];
  return `https://${slug}.${apex}/login`;
}
