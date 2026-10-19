import { DataSource } from "typeorm";
import { RedisClient } from "@/common";
import { BaseRepository } from "@/repository/base.repository";
import { Payment } from "@/database/entities/payment.entity";

export class PaymentRepository extends BaseRepository<Payment> {
  constructor(dataSource: DataSource, redis?: RedisClient) {
    super(Payment, dataSource, redis);
  }

  protected getAlias(): string {
    return "payment";
  }

  async findForPrintJob(job: {
    paymentReference?: string | null;
    code?: string | null;
  }): Promise<Payment | null> {
    if (job.paymentReference) {
      const p = await this.findOne({ where: { reference: job.paymentReference } });
      if (p) return p;
    }
    if (job.code) {
      return this.findOne({ where: { reference: job.code } });
    }
    return null;
  }

  async sumSuccessfulRevenue(tenantId: string, since?: Date): Promise<number> {
    const qb = this.createQueryBuilder("p")
      .select("COALESCE(SUM(p.amount), 0)", "total")
      .where("p.tenantId = :tid", { tid: tenantId })
      .andWhere("p.status = :s", { s: "SUCCESS" });
    if (since) qb.andWhere("p.createdAt >= :d", { d: since });
    const result = await qb.getRawOne<{ total: string }>();
    return parseFloat(result?.total || "0");
  }

  async revenueByDaySince(
    tenantId: string,
    since: Date,
  ): Promise<Array<{ date: string; revenue: number; jobCount: number }>> {
    const result = await this.createQueryBuilder("p")
      .select("DATE(p.createdAt)", "date")
      .addSelect("COALESCE(SUM(p.amount), 0)", "revenue")
      .addSelect("COUNT(*)", "jobCount")
      .where("p.tenantId = :tid", { tid: tenantId })
      .andWhere("p.status = :s", { s: "SUCCESS" })
      .andWhere("p.createdAt >= :d", { d: since })
      .groupBy("DATE(p.createdAt)")
      .orderBy("DATE(p.createdAt)", "ASC")
      .getRawMany();
    return result.map((r) => ({
      date: r.date,
      revenue: parseFloat(r.revenue),
      jobCount: parseInt(r.jobCount, 10),
    }));
  }

  async deleteByTenantId(tenantId: string): Promise<number> {
    const r = await this.createQueryBuilder()
      .delete()
      .where("tenantId = :tid", { tid: tenantId })
      .execute();
    return r.affected ?? 0;
  }
}
