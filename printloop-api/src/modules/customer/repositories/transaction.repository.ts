import { DataSource } from "typeorm";
import { RedisClient } from "@/common";
import { BaseRepository } from "@/repository/base.repository";
import { Transaction, TransactionType } from "@/database/entities/transaction.entity";
import { Wallet } from "@/database/entities/wallet.entity";

export class TransactionRepository extends BaseRepository<Transaction> {
  constructor(dataSource: DataSource, redis?: RedisClient) {
    super(Transaction, dataSource, redis);
  }

  protected getAlias(): string {
    return "tx";
  }

  async sumTopupAmountSince(tenantId: string, since: Date): Promise<number> {
    const row = await this.createQueryBuilder("tx")
      .select(`COALESCE(SUM(CAST(tx.amount AS REAL)), 0)`, "total")
      .where("tx.tenantId = :tid", { tid: tenantId })
      .andWhere("tx.createdAt >= :since", { since })
      .andWhere("tx.type = :type", { type: TransactionType.TOPUP })
      .getRawOne<{ total: string }>();
    return row ? Number(row.total) : 0;
  }

  async sumCommissionSince(tenantId: string, since: Date): Promise<number> {
    const row = await this.createQueryBuilder("tx")
      .select(`COALESCE(SUM(CAST(tx.commissionAmount AS REAL)), 0)`, "total")
      .where("tx.tenantId = :tid", { tid: tenantId })
      .andWhere("tx.createdAt >= :since", { since })
      .getRawOne<{ total: string }>();
    return row ? Number(row.total) : 0;
  }

  async sumNetByTenantTypes(
    tenantId: string,
    types: TransactionType[],
  ): Promise<number> {
    const row = await this.createQueryBuilder("tx")
      .select(
        `COALESCE(SUM(CAST(tx.amount AS REAL) - CAST(tx.commissionAmount AS REAL)), 0)`,
        "net",
      )
      .where("tx.tenantId = :tid", { tid: tenantId })
      .andWhere("tx.type IN (:...types)", { types })
      .getRawOne<{ net: string }>();
    return Number(row?.net ?? 0);
  }

  async sumNetAndCommissionByTenantTypes(
    tenantId: string,
    types: TransactionType[],
  ): Promise<{ net: number; commission: number }> {
    const row = await this.createQueryBuilder("tx")
      .select(
        `COALESCE(SUM(CAST(tx.amount AS REAL) - CAST(tx.commissionAmount AS REAL)), 0)`,
        "net",
      )
      .addSelect(
        `COALESCE(SUM(CAST(tx.commissionAmount AS REAL)), 0)`,
        "commission",
      )
      .where("tx.tenantId = :tid", { tid: tenantId })
      .andWhere("tx.type IN (:...types)", { types })
      .getRawOne<{ net: string; commission: string }>();
    return {
      net: Number(row?.net ?? 0),
      commission: Number(row?.commission ?? 0),
    };
  }

  async findInMonthRange(
    tenantId: string,
    start: Date,
    end: Date,
  ): Promise<Transaction[]> {
    return this.createQueryBuilder("tx")
      .where("tx.tenantId = :tid", { tid: tenantId })
      .andWhere("tx.createdAt >= :start AND tx.createdAt < :end", { start, end })
      .orderBy("tx.createdAt", "ASC")
      .getMany();
  }

  async findByWalletUserId(userId: string): Promise<Transaction[]> {
    return this.createQueryBuilder("tx")
      .innerJoin("tx.wallet", "w")
      .where("w.userId = :uid", { uid: userId })
      .getMany();
  }

  async recordPrintForWalletUser(opts: {
    userId: string;
    tenantId: string;
    amount: number;
    commissionAmount: number;
    description: string;
    reference: string;
  }): Promise<void> {
    await this.manager.transaction(async (em) => {
      const wallet = await em.findOne(Wallet, { where: { userId: opts.userId } });
      if (!wallet) return;
      const tx = em.create(Transaction, {
        walletId: wallet.id,
        tenantId: opts.tenantId,
        type: TransactionType.PRINT,
        amount: opts.amount,
        commissionAmount: opts.commissionAmount,
        description: opts.description,
        balanceAfter: Number(wallet.balance),
        reference: opts.reference,
      });
      await em.save(tx);
    });
  }
}
