import { DataSource } from "typeorm";
import { RedisClient } from "@/common";
import { BaseRepository } from "@/repository/base.repository";
import { PrinterProfile } from "@/database/entities/printerProfile.entity";

export class PrinterProfileRepository extends BaseRepository<PrinterProfile> {
  constructor(dataSource: DataSource, redis?: RedisClient) {
    super(PrinterProfile, dataSource, redis);
  }

  protected getAlias(): string {
    return "printerProfile";
  }
}
