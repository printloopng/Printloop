import { DataSource } from "typeorm";
import { RedisClient } from "@/common";
import { BaseRepository } from "@/repository/base.repository";
import { AuditLog } from "@/database/entities/auditLog.entity";

export class AuditLogRepository extends BaseRepository<AuditLog> {
  constructor(dataSource: DataSource, redis?: RedisClient) {
    super(AuditLog, dataSource, redis);
  }

  protected getAlias(): string {
    return "auditLog";
  }
}
