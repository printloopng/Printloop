import { DataSource } from "typeorm";
import { RedisClient } from "@/common";
import { BaseRepository } from "@/repository/base.repository";
import { TenantMember } from "@/database/entities/tenantMember.entity";

export class TenantMemberRepository extends BaseRepository<TenantMember> {
  constructor(dataSource: DataSource, redis?: RedisClient) {
    super(TenantMember, dataSource, redis);
  }

  protected getAlias(): string {
    return "tenantMember";
  }
}
