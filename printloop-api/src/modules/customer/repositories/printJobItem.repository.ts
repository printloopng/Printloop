import { DataSource } from "typeorm";
import { RedisClient } from "@/common";
import { BaseRepository } from "@/repository/base.repository";
import { PrintJobItem } from "@/database/entities/printJobItem.entity";

export class PrintJobItemRepository extends BaseRepository<PrintJobItem> {
  constructor(dataSource: DataSource, redis?: RedisClient) {
    super(PrintJobItem, dataSource, redis);
  }

  protected getAlias(): string {
    return "printJobItem";
  }
}
