import { DataSource } from "typeorm";
import { RedisClient } from "@/common";
import { BaseRepository } from "@/repository/base.repository";
import { PricingConfig } from "@/database/entities/pricingConfig.entity";

export class PricingConfigRepository extends BaseRepository<PricingConfig> {
  constructor(dataSource: DataSource, redis?: RedisClient) {
    super(PricingConfig, dataSource, redis);
  }

  protected getAlias(): string {
    return "pricingConfig";
  }
}
