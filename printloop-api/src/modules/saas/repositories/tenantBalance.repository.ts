import { DataSource } from "typeorm";
import { RedisClient } from "@/common";
import { BaseRepository } from "@/repository/base.repository";
import { TenantBalance } from "@/database/entities/tenantBalance.entity";

export class TenantBalanceRepository extends BaseRepository<TenantBalance> {
  constructor(dataSource: DataSource, redis?: RedisClient) {
    super(TenantBalance, dataSource, redis);
  }

  protected getAlias(): string {
    return "tenantBalance";
  }
}
