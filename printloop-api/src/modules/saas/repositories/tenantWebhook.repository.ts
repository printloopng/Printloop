import { DataSource } from "typeorm";
import { RedisClient } from "@/common";
import { BaseRepository } from "@/repository/base.repository";
import { TenantWebhook } from "@/database/entities/tenantWebhook.entity";

export class TenantWebhookRepository extends BaseRepository<TenantWebhook> {
  constructor(dataSource: DataSource, redis?: RedisClient) {
    super(TenantWebhook, dataSource, redis);
  }

  protected getAlias(): string {
    return "tenantWebhook";
  }
}
