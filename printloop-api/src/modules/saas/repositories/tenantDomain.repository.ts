import { DataSource } from "typeorm";
import { RedisClient } from "@/common";
import { BaseRepository } from "@/repository/base.repository";
import { TenantDomain } from "@/database/entities/tenantDomain.entity";

export class TenantDomainRepository extends BaseRepository<TenantDomain> {
  constructor(dataSource: DataSource, redis?: RedisClient) {
    super(TenantDomain, dataSource, redis);
  }

  protected getAlias(): string {
    return "tenantDomain";
  }
}
