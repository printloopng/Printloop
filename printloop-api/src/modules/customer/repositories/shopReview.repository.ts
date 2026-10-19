import { DataSource } from "typeorm";
import { RedisClient } from "@/common";
import { BaseRepository } from "@/repository/base.repository";
import { ShopReview } from "@/database/entities/shopReview.entity";

export class ShopReviewRepository extends BaseRepository<ShopReview> {
  constructor(dataSource: DataSource, redis?: RedisClient) {
    super(ShopReview, dataSource, redis);
  }

  protected getAlias(): string {
    return "shopReview";
  }
}
