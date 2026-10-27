import { randomBytes } from "node:crypto";
import { DataSource } from "typeorm";
import { RedisClient } from "@/common";
import { BaseRepository } from "@/repository/base.repository";
import { Tenant, TenantStatus } from "@/database/entities/tenant.entity";
import { TenantMember, TenantMemberRole } from "@/database/entities/tenantMember.entity";
import { User, UserRole } from "@/database/entities/user.entity";
import { Wallet } from "@/database/entities/wallet.entity";
import { PayoutSchedule, PayoutCadence } from "@/database/entities/payoutSchedule.entity";
import { PricingConfig, PaperSize, ColorType } from "@/database/entities/pricingConfig.entity";
import { Kiosk, KioskStatus } from "@/database/entities/kiosk.entity";
import { GroupSession } from "@/database/entities/groupSession.entity";
import { GroupParticipant } from "@/database/entities/groupParticipant.entity";
import { AuditLog } from "@/database/entities/auditLog.entity";
import { Promotion } from "@/database/entities/promotion.entity";
import { File } from "@/database/entities/file.entity";
import { Transaction } from "@/database/entities/transaction.entity";
import { Payment } from "@/database/entities/payment.entity";
import { PrintJobItem } from "@/database/entities/printJobItem.entity";
import { PrintJob } from "@/database/entities/printJob.entity";
import { Payout } from "@/database/entities/payout.entity";
import { TenantBalance } from "@/database/entities/tenantBalance.entity";
import { TenantBranding } from "@/database/entities/tenantBranding.entity";

export class TenantRepository extends BaseRepository<Tenant> {
  constructor(dataSource: DataSource, redis?: RedisClient) {
    super(Tenant, dataSource, redis);
  }

  protected getAlias(): string {
    return "tenant";
  }

  async findDiscoverableActive(): Promise<Tenant[]> {
    return this.createQueryBuilder("t")
      .where("t.isDiscoverable = :d", { d: true })
      .andWhere("t.status = :s", { s: TenantStatus.ACTIVE })
      .andWhere("t.availability != 'closed'")
      .getMany();
  }

  async hardDeleteAllData(tenantId: string): Promise<Record<string, number>> {
    const deleted: Record<string, number> = {};
    const em = this.manager;

    const sessions = await em.find(GroupSession, {
      where: { tenantId } as object,
    });
    const sessionIds = sessions.map((s) => s.id);
    if (sessionIds.length) {
      const r = await em
        .createQueryBuilder()
        .delete()
        .from(GroupParticipant)
        .where("groupSessionId IN (:...ids)", { ids: sessionIds })
        .execute();
      deleted.groupParticipants = r.affected ?? 0;
    }

    for (const Entity of [
      AuditLog,
      Promotion,
      PricingConfig,
      File,
      Transaction,
      Payment,
      PrintJobItem,
      PrintJob,
      Kiosk,
      Wallet,
      User,
      Payout,
      PayoutSchedule,
      GroupSession,
      TenantBalance,
      TenantBranding,
      TenantMember,
    ] as const) {
      const r = await em
        .createQueryBuilder()
        .delete()
        .from(Entity)
        .where("tenantId = :tid", { tid: tenantId })
        .execute();
      deleted[Entity.name] = r.affected ?? 0;
    }

    await em.delete(Tenant, { id: tenantId });
    deleted.Tenant = 1;
    return deleted;
  }

  async signupTenantRecords(
    input: {
      businessName: string;
      slug: string;
      ownerFirstName: string;
      ownerLastName: string;
      ownerEmail: string;
      ownerPhone: string;
      passwordHash: string;
      verificationToken: string;
      adminPrivileges: string[];
      initialAddress: string | null;
      initialLat: number | null;
      initialLng: number | null;
      commissionPct: number;
    },
  ): Promise<{ tenant: Tenant; owner: User }> {
    return this.manager.transaction(async (em) => {
      const existingSlug = await em.findOne(Tenant, {
        where: { slug: input.slug },
      });
      if (existingSlug) {
        throw new Error("SLUG_TAKEN");
      }

      const existingOwnerByEmail = await em
        .createQueryBuilder(User, "u")
        .where("LOWER(u.email) = :email", { email: input.ownerEmail })
        .andWhere("u.role IN (:...roles)", {
          roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
        })
        .getOne();
      if (existingOwnerByEmail) {
        throw new Error("EMAIL_TAKEN");
      }

      const tenant = await em.save(
        em.create(Tenant, {
          name: input.businessName,
          slug: input.slug,
          customDomain: null,
          status: TenantStatus.TRIAL,
          commissionPct: input.commissionPct,
          paystackSubaccountCode: null,
          suspendedAt: null,
          suspendReason: null,
          address: input.initialAddress,
          lat: input.initialLat,
          lng: input.initialLng,
          isDiscoverable: false,
        }),
      );

      const owner = await em.save(
        em.create(User, {
          tenantId: tenant.id,
          firstName: input.ownerFirstName,
          lastName: input.ownerLastName,
          email: input.ownerEmail,
          phoneNumber: input.ownerPhone,
          passwordHash: input.passwordHash,
          salt: "bcrypt",
          isEmailVerified: false,
          verificationToken: input.verificationToken,
          role: UserRole.ADMIN,
          adminPrivileges: input.adminPrivileges as never,
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
          name: "Main Kiosk",
          apiKey: `KSK_${randomBytes(24).toString("base64url")}`,
          location: tenant.address || undefined,
          printerName: "HP LaserJet Pro",
          status: KioskStatus.ACTIVE,
        }),
      );

      return { tenant, owner };
    });
  }
}

const DEFAULT_PRICING_CELLS: Array<{
  paper: PaperSize;
  color: ColorType;
  p100Sx: number;
  p300Sx: number;
  p600Sx: number;
  p100Dx: number;
  p300Dx: number;
  p600Dx: number;
}> = [
  { paper: PaperSize.A4, color: ColorType.BLACK_WHITE, p100Sx: 50, p300Sx: 70, p600Sx: 100, p100Dx: 65, p300Dx: 90, p600Dx: 120 },
  { paper: PaperSize.A4, color: ColorType.COLOR, p100Sx: 100, p300Sx: 200, p600Sx: 300, p100Dx: 150, p300Dx: 250, p600Dx: 350 },
  { paper: PaperSize.A3, color: ColorType.BLACK_WHITE, p100Sx: 100, p300Sx: 150, p600Sx: 300, p100Dx: 150, p300Dx: 230, p600Dx: 400 },
  { paper: PaperSize.A3, color: ColorType.COLOR, p100Sx: 250, p300Sx: 400, p600Sx: 650, p100Dx: 390, p300Dx: 400, p600Dx: 650 },
];

async function seedDefaultPricing(
  em: import("typeorm").EntityManager,
  tenantId: string,
): Promise<void> {
  for (const cell of DEFAULT_PRICING_CELLS) {
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
        currency: "NGN",
      }),
    );
  }
}
