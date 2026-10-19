import { DataSource } from "typeorm";
import { RedisClient } from "@/common";
import { BaseRepository } from "@/repository/base.repository";
import { TenantBranding } from "@/database/entities/tenantBranding.entity";

export class TenantBrandingRepository extends BaseRepository<TenantBranding> {
  constructor(dataSource: DataSource, redis?: RedisClient) {
    super(TenantBranding, dataSource, redis);
  }

  protected getAlias(): string {
    return "tenantBranding";
  }
}
