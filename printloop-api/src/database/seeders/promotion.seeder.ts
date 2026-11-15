import { DataSource } from "typeorm";
import { Promotion } from "@/database/entities/promotion.entity";
import { Tenant } from "@/database/entities/tenant.entity";

export class PromotionSeeder {
  public async run(dataSource: DataSource, shop: Tenant): Promise<Promotion[]> {
    const repo = dataSource.getRepository(Promotion);

    return repo.save([
      repo.create({
        tenantId: shop.id,
        code: "EXAMWEEK",
        name: "Exam week boost",
        description: "20 free pages after 100",
        discountType: "free_pages",
        discountValue: 20,
        status: "active",
        usageCount: 44
      }),
      repo.create({
        tenantId: shop.id,
        code: "FIRST2FREE",
        name: "First two pages free",
        description: "First print credit",
        discountType: "free_pages",
        discountValue: 2,
        status: "inactive",
        usageCount: 128
      })
    ]);
  }
}
