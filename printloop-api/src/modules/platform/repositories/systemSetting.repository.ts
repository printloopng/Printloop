import { DataSource } from "typeorm";
import { RedisClient } from "@/common";
import { BaseRepository } from "@/repository/base.repository";
import { SystemSetting } from "@/database/entities/systemSetting.entity";

export class SystemSettingRepository extends BaseRepository<SystemSetting> {
  constructor(dataSource: DataSource, redis?: RedisClient) {
    super(SystemSetting, dataSource, redis);
  }

  protected getAlias(): string {
    return "systemSetting";
  }
}
