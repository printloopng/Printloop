import { DataSource } from "typeorm";
import { RedisClient } from "@/common";
import { BaseRepository } from "@/repository/base.repository";
import { Promotion } from "@/database/entities/promotion.entity";

export class PromotionRepository extends BaseRepository<Promotion> {
  constructor(dataSource: DataSource, redis?: RedisClient) {
    super(Promotion, dataSource, redis);
  }

  protected getAlias(): string {
    return "promotion";
  }

  async incrementUsageIfAvailable(id: string): Promise<boolean> {
    const result = await this.createQueryBuilder()
      .update(Promotion)
      .set({ usageCount: () => "usageCount + 1" })
      .where("id = :id AND (maxUses IS NULL OR usageCount < maxUses)", { id })
      .execute();
    return (result.affected ?? 0) === 1;
  }
}
