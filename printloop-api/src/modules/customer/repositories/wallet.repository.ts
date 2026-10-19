import { DataSource } from "typeorm";
import { RedisClient } from "@/common";
import { BaseRepository } from "@/repository/base.repository";
import { Wallet } from "@/database/entities/wallet.entity";

export class WalletRepository extends BaseRepository<Wallet> {
  constructor(dataSource: DataSource, redis?: RedisClient) {
    super(Wallet, dataSource, redis);
  }

  protected getAlias(): string {
    return "wallet";
  }
}
