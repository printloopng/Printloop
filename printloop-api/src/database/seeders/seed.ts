import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { AppDataSource } from '@/config/data-source';
import { User, UserRole } from '@/database/entities/user.entity';
import { Wallet } from '@/database/entities/wallet.entity';
import { Kiosk, KioskStatus } from '@/database/entities/kiosk.entity';
import { PricingConfig, PaperSize, ColorType } from '@/database/entities/pricingConfig.entity';
import { ensureSystemSettings } from '@/config/settings';
import { Payment } from '@/database/entities/payment.entity';
import { PrintJob, PrintJobStatus } from '@/database/entities/printJob.entity';
import { Promotion } from '@/database/entities/promotion.entity';
import { AuditLog } from '@/database/entities/auditLog.entity';
import { GroupSession, GroupSessionStatus } from '@/database/entities/groupSession.entity';
import { Tenant, TenantStatus } from '@/database/entities/tenant.entity';
import { TenantMember, TenantMemberRole } from '@/database/entities/tenantMember.entity';
import { PayoutSchedule, PayoutCadence } from '@/database/entities/payoutSchedule.entity';
import { BlogPost, BlogPostStatus } from '@/database/entities/blogPost.entity';
import { LEGACY_TENANT_SLUG } from '@/common/middleware/tenant.middleware';

function code(len = 6) {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: len }, () => a[Math.floor(Math.random() * a.length)]).join('');
}

export async function runSeed(): Promise<void> {
  const userRepo = AppDataSource.getRepository(User);

  const legacyId = await getOrCreateLegacyTenantId();
  await ensureSystemSettings();

  if ((await userRepo.count()) > 0) {
    console.log('Seed: users already present, skipping.');
    return;
  }

  if (process.env.SEED_DEMO !== '1') {
    console.log(
      'Seed: empty DB but SEED_DEMO != "1" — production mode, no ' +
        'demo data inserted. Run `tsx scripts/createSuperAdmin.ts ' +
        '<email> <password>` to mint the first SUPER_ADMIN.',
    );
    return;
  }

  console.log('Seed: empty database + SEED_DEMO=1 — seeding demo data...');

  const hash = (pw: string) => bcrypt.hashSync(pw, 12);

  const admin = await userRepo.save(
    userRepo.create({
      tenantId: legacyId,
      firstName: 'Print',
      lastName: 'Admin',
      email: 'admin@printloop.test',
      phoneNumber: '+2348000000001',
      passwordHash: hash('Admin1234!'),
      salt: 'bcrypt',
      isEmailVerified: true,
      role: UserRole.SUPER_ADMIN,
      adminPrivileges: [],
    })
  );

  const opsAdmin = await userRepo.save(
    userRepo.create({
      tenantId: legacyId,
      firstName: 'Ops',
      lastName: 'Manager',
      email: 'ops@printloop.test',
      phoneNumber: '+2348000000002',
      passwordHash: hash('Admin1234!'),
      salt: 'bcrypt',
      isEmailVerified: true,
      role: UserRole.ADMIN,
      adminPrivileges: ['view_dashboard', 'view_jobs', 'requeue_jobs', 'view_kiosks', 'manage_kiosks'] as any,
    })
  );

  const demo = await userRepo.save(
    userRepo.create({
      tenantId: legacyId,
      firstName: 'Demo',
      lastName: 'Student',
      email: 'student@printloop.test',
      phoneNumber: '+2348000000000',
      passwordHash: hash('Password1!'),
      salt: 'bcrypt',
      isEmailVerified: true,
      role: UserRole.USER,
      adminPrivileges: [],
    })
  );

  const walletRepo = AppDataSource.getRepository(Wallet);
  await walletRepo.save(walletRepo.create({ tenantId: legacyId, userId: demo.id, balance: 0 }));
  await walletRepo.save(walletRepo.create({ tenantId: legacyId, userId: opsAdmin.id, balance: 0 }));

  const kioskRepo = AppDataSource.getRepository(Kiosk);
  const kioskSeed = [
    { name: 'Yaba Central', location: 'Yaba, Lagos', campus: 'Yaba', status: KioskStatus.ACTIVE },
    { name: 'UNILAG — Faculty of Arts', location: 'Akoka', campus: 'UNILAG', status: KioskStatus.ACTIVE },
    { name: 'UNILAG — Sports Centre', location: 'Akoka', campus: 'UNILAG', status: KioskStatus.ACTIVE },
    { name: 'Bariga Print Hub', location: 'Bariga', campus: 'Bariga', status: KioskStatus.ACTIVE },
  ];
  const kiosks: Kiosk[] = [];
  for (const k of kioskSeed) {
    kiosks.push(
      await kioskRepo.save(
        kioskRepo.create({
          ...k,
          tenantId: legacyId,
          apiKey: `KSK_${randomBytes(18).toString('base64url')}`,
          printerModel: 'HP LaserJet Pro M404n',
          ipAddress: `192.168.1.${100 + kiosks.length}`,
          lastSeenAt: new Date(),
          totalJobsPrinted: Math.floor(Math.random() * 400) + 50,
          totalPagesPrinted: Math.floor(Math.random() * 4000) + 500,
        })
      )
    );
  }

  const pricingRepo = AppDataSource.getRepository(PricingConfig);
  await pricingRepo.save([
    pricingRepo.create({
      tenantId: legacyId,
      paperSize: PaperSize.A4, colorType: ColorType.BLACK_WHITE,
      pricePerPage: 70, duplexMultiplier: 1.0, highResolutionMultiplier: 1.0,
      price100Simplex: 50,  price300Simplex: 70,  price600Simplex: 100,
      price100Duplex:  65,  price300Duplex:  90,  price600Duplex:  120,
    }),
    pricingRepo.create({
      tenantId: legacyId,
      paperSize: PaperSize.A4, colorType: ColorType.COLOR,
      pricePerPage: 200, duplexMultiplier: 1.0, highResolutionMultiplier: 1.0,
      price100Simplex: 100, price300Simplex: 200, price600Simplex: 300,
      price100Duplex:  150, price300Duplex:  250, price600Duplex:  350,
    }),
    pricingRepo.create({
      tenantId: legacyId,
      paperSize: PaperSize.A3, colorType: ColorType.BLACK_WHITE,
      pricePerPage: 150, duplexMultiplier: 1.0, highResolutionMultiplier: 1.0,
      price100Simplex: 100, price300Simplex: 150, price600Simplex: 300,
      price100Duplex:  150, price300Duplex:  230, price600Duplex:  400,
    }),
    pricingRepo.create({
      tenantId: legacyId,
      paperSize: PaperSize.A3, colorType: ColorType.COLOR,
      pricePerPage: 400, duplexMultiplier: 1.0, highResolutionMultiplier: 1.0,
      price100Simplex: 250, price300Simplex: 400, price600Simplex: 650,
      price100Duplex:  390, price300Duplex:  400, price600Duplex:  650,
    }),
  ]);

  const paymentRepo = AppDataSource.getRepository(Payment);
  const jobRepo = AppDataSource.getRepository(PrintJob);
  const statuses = [PrintJobStatus.DONE, PrintJobStatus.DONE, PrintJobStatus.READY, PrintJobStatus.FAILED];

  for (let d = 29; d >= 0; d--) {
    const when = new Date();
    when.setDate(when.getDate() - d);
    const jobsThatDay = 1 + ((d * 7) % 4);
    for (let n = 0; n < jobsThatDay; n++) {
      const pages = 2 + ((d + n) % 18);
      const cost = pages * 5;
      const status = statuses[(d + n) % statuses.length];
      const kiosk = kiosks[(d + n) % kiosks.length];

      const job = await jobRepo.save(
        jobRepo.create({
          tenantId: legacyId,
          userId: demo.id,
          fileName: `Document ${d}-${n}.pdf`,
          code: code(),
          cost,
          totalPages: pages,
          jobType: 'single',
          status,
          printConfiguration: { copies: 1, paper: 'A4', color: 'bw', sided: 'single', qualityDpi: 300 },
          kioskId: kiosk.id,
          printerId: kiosk.id,
          expiresAt: new Date(when.getTime() + 24 * 3600 * 1000),
          completedAt: status === PrintJobStatus.DONE ? when : (null as any),
        })
      );
      await AppDataSource.getRepository(PrintJob).update({ id: job.id }, { createdAt: when, updatedAt: when });

      if (status === PrintJobStatus.DONE) {
        const pay = await paymentRepo.save(
          paymentRepo.create({
            tenantId: legacyId,
            userId: demo.id,
            amount: cost,
            status: 'SUCCESS',
            method: 'card',
            reference: job.code || '',
            description: job.fileName,
          } as any) as any
        );
        await AppDataSource.getRepository(Payment).update({ id: pay.id }, { createdAt: when, updatedAt: when } as any);
      }
    }
  }

  const promoRepo = AppDataSource.getRepository(Promotion);
  await promoRepo.save([
    promoRepo.create({ tenantId: legacyId, code: 'EXAMWEEK', name: 'Exam week boost', description: '20 free pages after 100', discountType: 'free_pages', discountValue: 20, status: 'active', usageCount: 44 }),
    promoRepo.create({ tenantId: legacyId, code: 'FIRST2FREE', name: 'First two pages free', description: 'First print credit', discountType: 'free_pages', discountValue: 2, status: 'inactive', usageCount: 128 }),
  ]);

  const sessionRepo = AppDataSource.getRepository(GroupSession);
  await sessionRepo.save(
    sessionRepo.create({
      tenantId: legacyId,
      hostUserId: demo.id,
      groupName: 'CSC 301 Assignment 2',
      deadline: new Date(Date.now() + 8 * 3600 * 1000),
      status: GroupSessionStatus.OPEN,
      shareUrl: '/groups/csc-301-assignment-2/join',
      defaultOptions: { paper: 'A4', color: 'bw', sided: 'double', qualityDpi: 300, enforce: true },
    })
  );

  const blogRepo = AppDataSource.getRepository(BlogPost);
  const now = new Date();
  const blogSeed = [
    {
      slug: 'how-printloop-works',
      title: 'How PrintLoop works — from phone to paper in five minutes',
      excerpt:
        'Upload from your phone, pay once with Paystack, walk into any PrintLoop station and enter your code. Here is the whole loop, end to end.',
      content:
        '## The loop in five steps\n\n**1. Upload.** Send your PDF, Word document, PowerPoint or image from your phone — no app install, no USB stick.\n\n**2. Price it.** You see the exact cost before you pay: per page, per copy, per colour. The shop\u2019s pricing matrix is public, not a surprise at the counter.\n\n**3. Pay once.** Secure checkout via Paystack — card, transfer or USSD.\n\n**4. Get your code.** A 6-digit release code arrives instantly by SMS and email.\n\n**5. Collect.** Walk into any PrintLoop station, enter the code, and your prints are ready.\n\n## Why a code?\n\nThe code is your print token. The kiosk can\u2019t print your document until you release it, so your file stays private and nothing prints until you\u2019re there to pick it up.',
      authorName: 'PrintLoop Team',
      tags: ['guide', 'how-it-works'],
      status: BlogPostStatus.PUBLISHED,
      publishedAt: new Date(now.getTime() - 6 * 24 * 3600 * 1000),
    },
    {
      slug: 'print-from-word-or-powerpoint',
      title: 'Printing Word, PowerPoint and Excel files — what happens to your pages',
      excerpt:
        'Office documents are converted to PDF before printing. Here is what that means for your page count and your price.',
      content:
        '## Your file, converted\n\nWhen you upload a .docx, .pptx or .xlsx, we convert it to a clean PDF before it ever reaches a printer. That conversion is what makes the printed output look exactly like your screen.\n\n## Page count is confirmed after conversion\n\nWord documents don\u2019t always have a fixed page count until they\u2019re laid out. That\u2019s why Office uploads show an **estimated** price, and the final price is confirmed after conversion. If the real page count is higher, the difference is charged to your saved card at the kiosk. If it\u2019s lower, you keep the difference — no refunds needed, no waiting.\n\n## Images too\n\nJPGs and PNGs are wrapped onto A4 pages, centred and scaled to fit.',
      authorName: 'PrintLoop Team',
      tags: ['office', 'guide'],
      status: BlogPostStatus.PUBLISHED,
      publishedAt: new Date(now.getTime() - 2 * 24 * 3600 * 1000),
    },
    {
      slug: 'group-printing-for-course-reps',
      title: 'Group printing: one link, one code, every classmate\u2019s assignment',
      excerpt:
        'Course representatives can collect and print an entire class\u2019s submissions with one shareable link and one release code.',
      content:
        '## One link, whole class\n\nCreate a group session, share the link in your WhatsApp group, and every classmate uploads their own document, chooses their own settings, and pays for their own pages.\n\n## One code at the kiosk\n\nWhen the deadline passes, you get a single release code. Enter it at the kiosk and the whole batch prints in upload order — collated, ready to hand back.\n\n## Perfect for\n\n- Course assignments and project submissions\n- Club forms and registration packs\n- NYSC and departmental paperwork',
      authorName: 'PrintLoop Team',
      tags: ['groups', 'students'],
      status: BlogPostStatus.PUBLISHED,
      publishedAt: new Date(now.getTime() - 1 * 24 * 3600 * 1000),
    },
  ];
  await blogRepo.save(blogSeed.map((p) => blogRepo.create({ tenantId: legacyId, ...p })));

  const auditRepo = AppDataSource.getRepository(AuditLog);
  await auditRepo.save([
    auditRepo.create({ actorId: admin.id, actorName: 'Print Admin', action: 'system.seeded', target: 'system', detail: { note: 'Initial demo data' }, ipAddress: '127.0.0.1' }),
    auditRepo.create({ actorId: opsAdmin.id, actorName: 'Ops Manager', action: 'kiosk.status_changed', target: `kiosk:${kiosks[3].id}`, detail: { to: 'OFFLINE' }, ipAddress: '127.0.0.1' }),
  ]);

  console.log('Seed: done. Admin login → admin@printloop.test / Admin1234!');
}

export async function getOrCreateLegacyTenantId(): Promise<string> {
  const tenantRepo = AppDataSource.getRepository(Tenant);
  let legacy = await tenantRepo.findOne({
    where: { slug: LEGACY_TENANT_SLUG },
  });
  if (!legacy) {
    legacy = await tenantRepo.save(
      tenantRepo.create({
        name: 'PrintLoop (legacy)',
        slug: LEGACY_TENANT_SLUG,
        customDomain: null,
        status: TenantStatus.ACTIVE,
        commissionPct: Number(process.env.COMMISSION_PCT_DEFAULT || 0.1),
        paystackSubaccountCode: null,
        suspendedAt: null,
        suspendReason: null,
      }),
    );
    console.log(`Legacy tenant: created ${legacy.id} (slug='${legacy.slug}')`);
  }
  return legacy.id;
}

export async function ensureLegacyTenant(): Promise<void> {
  const tenantRepo = AppDataSource.getRepository(Tenant);
  const legacyId = await getOrCreateLegacyTenantId();
  const legacy = await tenantRepo.findOneOrFail({ where: { id: legacyId } });

  const scheduleRepo = AppDataSource.getRepository(PayoutSchedule);
  const existingSchedule = await scheduleRepo.findOne({
    where: { tenantId: legacy.id },
  });
  if (!existingSchedule) {
    await scheduleRepo.save(
      scheduleRepo.create({
        tenantId: legacy.id,
        cadence: PayoutCadence.WEEKLY,
        dayOfWeek: 5,
        minPayoutAmount: 5000,
      }),
    );
  }

  const BACKFILL_TABLES = [
    'transactions',
    'users',
    'wallets',
    'kiosks',
    'print_jobs',
    'payments',
    'files',
    'pricing_configs',
    'promotions',
    'group_sessions',
    'audit_logs',
  ] as const;
  for (const table of BACKFILL_TABLES) {
    try {
      await AppDataSource.createQueryBuilder()
        .update(table)
        .set({ tenantId: legacy.id })
        .where('"tenantId" IS NULL')
        .execute();
    } catch (err) {
      console.warn(`[seed] tenantId backfill skipped for ${table}:`, err);
    }
  }

  const userRepo = AppDataSource.getRepository(User);
  const memberRepo = AppDataSource.getRepository(TenantMember);
  const admins = await userRepo.find({
    where: [
      { role: UserRole.ADMIN, tenantId: legacy.id },
      { role: UserRole.ADMIN, tenantId: null as any },
      { role: UserRole.SUPER_ADMIN, tenantId: legacy.id },
      { role: UserRole.SUPER_ADMIN, tenantId: null as any },
    ],
  });
  for (const admin of admins) {
    const already = await memberRepo.findOne({
      where: { tenantId: legacy.id, userId: admin.id },
    });
    if (!already) {
      await memberRepo.save(
        memberRepo.create({
          tenantId: legacy.id,
          userId: admin.id,
          role:
            admin.role === UserRole.SUPER_ADMIN
              ? TenantMemberRole.OWNER
              : TenantMemberRole.ADMIN,
        }),
      );
    }
  }
}
