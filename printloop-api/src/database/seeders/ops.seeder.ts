import { DataSource } from "typeorm";
import { AuditLog } from "@/database/entities/auditLog.entity";
import { Kiosk } from "@/database/entities/kiosk.entity";
import { Tenant } from "@/database/entities/tenant.entity";
import { User } from "@/database/entities/user.entity";

export class OpsSeeder {
  public async run(
    dataSource: DataSource,
    shop: Tenant,
    platformAdmin: User,
    shopAdmin: User,
    kiosks: Kiosk[]
  ): Promise<AuditLog[]> {
    const repo = dataSource.getRepository(AuditLog);
    const lastKiosk = kiosks[kiosks.length - 1];

    return repo.save([
      repo.create({
        tenantId: shop.id,
        actorId: platformAdmin.id,
        actorName: "Print Admin",
        action: "system.seeded",
        target: "system",
        detail: { note: "Initial demo data" },
        ipAddress: "127.0.0.1"
      }),
      repo.create({
        tenantId: shop.id,
        actorId: shopAdmin.id,
        actorName: "Ops Manager",
        action: "kiosk.status_changed",
        target: `kiosk:${lastKiosk?.id ?? "unknown"}`,
        detail: { to: "OFFLINE" },
        ipAddress: "127.0.0.1"
      })
    ]);
  }
}
