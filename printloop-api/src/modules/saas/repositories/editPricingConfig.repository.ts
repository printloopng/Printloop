import { DataSource } from "typeorm";
import { RedisClient } from "@/common";
import { BaseRepository } from "@/repository/base.repository";
import { EditPricingConfig } from "@/database/entities/editPricingConfig.entity";

export class EditPricingConfigRepository extends BaseRepository<EditPricingConfig> {
  constructor(dataSource: DataSource, redis?: RedisClient) {
    super(EditPricingConfig, dataSource, redis);
  }

  protected getAlias(): string {
    return "editPricingConfig";
  }
}
