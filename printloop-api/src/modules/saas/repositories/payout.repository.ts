import { DataSource } from "typeorm";
import { RedisClient } from "@/common";
import { BaseRepository } from "@/repository/base.repository";
import { Payout, PayoutStatus } from "@/database/entities/payout.entity";

export class PayoutRepository extends BaseRepository<Payout> {
  constructor(dataSource: DataSource, redis?: RedisClient) {
    super(Payout, dataSource, redis);
  }

  protected getAlias(): string {
    return "payout";
  }

  async sumPaidAmountByTenant(tenantId: string): Promise<number> {
    const row = await this.createQueryBuilder("p")
      .select(`COALESCE(SUM(CAST(p.amount AS REAL)), 0)`, "total")
      .where("p.tenantId = :tid", { tid: tenantId })
      .andWhere("p.status = :s", { s: PayoutStatus.PAID })
      .getRawOne<{ total: string }>();
    return Number(row?.total ?? 0);
  }

  async sumPendingOrProcessingByTenant(tenantId: string): Promise<number> {
    const row = await this.createQueryBuilder("p")
      .select(`COALESCE(SUM(CAST(p.amount AS REAL)), 0)`, "total")
      .where("p.tenantId = :tid", { tid: tenantId })
      .andWhere("p.status IN (:...states)", {
        states: [PayoutStatus.PENDING, PayoutStatus.PROCESSING],
      })
      .getRawOne<{ total: string }>();
    return Number(row?.total ?? 0);
  }

  async sumCommittedByTenant(tenantId: string): Promise<number> {
    const row = await this.createQueryBuilder("p")
      .select(`COALESCE(SUM(CAST(p.amount AS REAL)), 0)`, "total")
      .where("p.tenantId = :tid", { tid: tenantId })
      .andWhere("p.status IN (:...states)", {
        states: [
          PayoutStatus.PENDING,
          PayoutStatus.PROCESSING,
          PayoutStatus.PAID,
        ],
      })
      .getRawOne<{ total: string }>();
    return Number(row?.total ?? 0);
  }

  async findInMonthRange(
    tenantId: string,
    start: Date,
    end: Date,
  ): Promise<Payout[]> {
    return this.createQueryBuilder("p")
      .where("p.tenantId = :tid", { tid: tenantId })
      .andWhere("p.createdAt >= :start AND p.createdAt < :end", { start, end })
      .orderBy("p.createdAt", "ASC")
      .getMany();
  }

  async deleteByTenantId(tenantId: string): Promise<number> {
    const r = await this.createQueryBuilder()
      .delete()
      .where("tenantId = :tid", { tid: tenantId })
      .execute();
    return r.affected ?? 0;
  }
}
