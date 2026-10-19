import { DataSource } from "typeorm";
import { RedisClient } from "@/common";
import { BaseRepository } from "@/repository/base.repository";
import { Dispute } from "@/database/entities/dispute.entity";

export class DisputeRepository extends BaseRepository<Dispute> {
  constructor(dataSource: DataSource, redis?: RedisClient) {
    super(Dispute, dataSource, redis);
  }

  protected getAlias(): string {
    return "dispute";
  }
}
