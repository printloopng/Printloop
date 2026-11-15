import { DataSource } from "typeorm";
import { Tenant, TenantStatus } from "@/database/entities/tenant.entity";
import { PayoutSchedule, PayoutCadence } from "@/database/entities/payoutSchedule.entity";

export const DEMO_SHOP_SLUG = "campus-print";

export class TenantSeeder {
  public async run(dataSource: DataSource): Promise<Tenant> {
    const tenantRepo = dataSource.getRepository(Tenant);
    const scheduleRepo = dataSource.getRepository(PayoutSchedule);

    const shop = await tenantRepo.save(
      tenantRepo.create({
        name: "Campus Print Hub",
        slug: DEMO_SHOP_SLUG,
        customDomain: null,
        status: TenantStatus.ACTIVE,
        isDiscoverable: true,
        commissionPct: null,
        paystackSubaccountCode: null,
        suspendedAt: null,
        suspendReason: null,
        address: "Akoka, Yaba, Lagos",
        lat: 6.5158,
        lng: 3.3898
      })
    );

    await scheduleRepo.save(
      scheduleRepo.create({
        tenantId: shop.id,
        cadence: PayoutCadence.WEEKLY,
        dayOfWeek: 5,
        minPayoutAmount: 5000
      })
    );

    return shop;
  }
}
