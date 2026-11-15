import { DataSource } from "typeorm";
import { randomBytes } from "node:crypto";
import { faker } from "@faker-js/faker";
import { Kiosk, KioskStatus } from "@/database/entities/kiosk.entity";
import { Tenant } from "@/database/entities/tenant.entity";

const KIOSKS = [
  { name: "Yaba Central", location: "Yaba, Lagos", campus: "Yaba" },
  { name: "UNILAG — Faculty of Arts", location: "Akoka", campus: "UNILAG" },
  { name: "UNILAG — Sports Centre", location: "Akoka", campus: "UNILAG" },
  { name: "Bariga Print Hub", location: "Bariga", campus: "Bariga" }
];

export class KioskSeeder {
  public async run(dataSource: DataSource, shop: Tenant): Promise<Kiosk[]> {
    const repo = dataSource.getRepository(Kiosk);

    const kiosks = KIOSKS.map((k, i) =>
      repo.create({
        ...k,
        status: KioskStatus.ACTIVE,
        tenantId: shop.id,
        apiKey: `KSK_${randomBytes(18).toString("base64url")}`,
        printerModel: "HP LaserJet Pro M404n",
        ipAddress: `192.168.1.${100 + i}`,
        lastSeenAt: new Date(),
        totalJobsPrinted: faker.number.int({ min: 50, max: 450 }),
        totalPagesPrinted: faker.number.int({ min: 500, max: 4500 })
      })
    );

    return repo.save(kiosks);
  }
}
