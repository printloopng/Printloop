import { DataSource } from "typeorm";
import { RedisClient } from "@/common";
import { BaseRepository } from "@/repository/base.repository";
import { PrintJob, PrintJobStatus } from "@/database/entities/printJob.entity";
import { Tenant } from "@/database/entities/tenant.entity";
import { Payment } from "@/database/entities/payment.entity";
import { Wallet } from "@/database/entities/wallet.entity";
import {
  Transaction,
  TransactionType,
} from "@/database/entities/transaction.entity";
import { makeCode } from "@/core/utils/releaseCode";

export class PrintJobRepository extends BaseRepository<PrintJob> {
  constructor(dataSource: DataSource, redis?: RedisClient) {
    super(PrintJob, dataSource, redis);
  }

  protected getAlias(): string {
    return "pj";
  }

  async countForUserSince(
    tenantId: string,
    userId: string,
    since: Date,
    statuses: string[],
  ): Promise<number> {
    return this.createQueryBuilder("pj")
      .where("pj.tenantId = :tid", { tid: tenantId })
      .andWhere("pj.userId = :uid", { uid: userId })
      .andWhere("pj.createdAt >= :since", { since })
      .andWhere("pj.status IN (:...statuses)", { statuses })
      .getCount();
  }

  async findStuckRenderingBefore(cutoff: Date): Promise<PrintJob[]> {
    return this.createQueryBuilder("pj")
      .where("pj.status = :s", { s: PrintJobStatus.RENDERING })
      .andWhere("pj.updatedAt < :cutoff", { cutoff: cutoff.toISOString() })
      .getMany();
  }

  async persistRenderReconciliation(
    job: PrintJob,
    opts: {
      pageCount: number;
      renderedKey: string;
      renderedPdfUrl: string;
      previewImageUrls: string[];
      isFirstCallback: boolean;
      finalCost: number;
    },
  ): Promise<void> {
    await this.manager.transaction(async (em) => {
      job.totalPages = opts.pageCount;
      job.renderedKey = opts.renderedKey;
      job.renderedPdfUrl = opts.renderedPdfUrl;
      job.previewImageUrls = opts.previewImageUrls;
      job.renderingStatus = "ready";
      job.renderingCompletedAt = new Date();
      job.status = job.requiresAccept
        ? PrintJobStatus.AWAITING_ACCEPT
        : PrintJobStatus.READY;
      if (opts.isFirstCallback) {
        job.finalCost = opts.finalCost;
        job.costReconciledAt = new Date();
      }
      await em.save(PrintJob, job);
    });
  }

  async applyShortfallSettlement(opts: {
    job: PrintJob;
    payment: Payment;
    shortfall: number;
    commissionAmount: number;
    reference: string;
  }): Promise<void> {
    const { job, payment, shortfall, commissionAmount, reference } = opts;
    await this.manager.transaction(async (em) => {
      if (job.userId) {
        const wallet = await em.findOne(Wallet, {
          where: { userId: job.userId },
        });
        if (wallet) {
          await em.save(
            Transaction,
            em.create(Transaction, {
              walletId: wallet.id,
              tenantId: job.tenantId,
              type: TransactionType.PRINT,
              amount: shortfall,
              commissionAmount,
              description: `Print price adjustment (${job.fileName || "job"}) — final cost`,
              balanceAfter: Number(wallet.balance),
              reference,
            }),
          );
        }
      }
      job.cost = job.finalCost!;
      await em.save(PrintJob, job);
      payment.amount = Math.round((Number(payment.amount) + shortfall) * 100) / 100;
      await em.save(Payment, payment);
    });
  }

  async completePrintJobPayment(
    jobId: string,
    reference: string,
    opts?: { authorizationCode?: string | null },
    computeCommission?: (tenant: Tenant, cost: number) => number,
  ): Promise<{
    success: boolean;
    code?: string;
    job?: PrintJob;
    commissionAmount?: number;
    completedPayment?: boolean;
  }> {
    return this.manager.transaction(async (em) => {
      const job = await em.findOne(PrintJob, {
        where: { id: jobId },
        relations: ["user"],
      });
      if (!job) {
        throw new Error(`Print job ${jobId} not found`);
      }
      if (job.status !== PrintJobStatus.PENDING) {
        return {
          success: true,
          code: job.code || undefined,
          job,
          completedPayment: false,
        };
      }

      const code = job.code || makeCode(6);
      job.code = code;

      let requiresAccept = false;
      if (job.tenantId) {
        const tenant = await em.findOne(Tenant, { where: { id: job.tenantId } });
        requiresAccept = Boolean(tenant?.isDiscoverable);
      }
      job.requiresAccept = requiresAccept;
      job.paymentReference = reference;
      job.status = PrintJobStatus.PENDING;
      await em.save(PrintJob, job);

      let commissionAmount = 0;
      if (job.tenantId && computeCommission) {
        const tenant = await em.findOne(Tenant, { where: { id: job.tenantId } });
        if (tenant) {
          commissionAmount = computeCommission(tenant, Number(job.cost));
        }
      }

      const payment = em.create(Payment, {
        tenantId: job.tenantId,
        userId: job.userId,
        amount: job.cost,
        status: "SUCCESS",
        method: "card",
        reference,
        description: job.fileName || "Direct Print Payment",
        authorizationCode: opts?.authorizationCode ?? null,
      } as Partial<Payment>);
      await em.save(Payment, payment);

      if (job.userId) {
        const wallet = await em.findOne(Wallet, { where: { userId: job.userId } });
        if (wallet) {
          const transaction = em.create(Transaction, {
            walletId: wallet.id,
            tenantId: job.tenantId,
            type: TransactionType.PRINT,
            amount: job.cost,
            commissionAmount,
            description: `Direct Print: ${job.fileName}`,
            balanceAfter: Number(wallet.balance),
            reference,
          });
          await em.save(Transaction, transaction);
        }
      }

      return {
        success: true,
        code,
        job,
        commissionAmount,
        completedPayment: true,
      };
    });
  }

  async countCompletedSince(tenantId: string, since: Date): Promise<number> {
    return this.createQueryBuilder("j")
      .where("j.tenantId = :tid", { tid: tenantId })
      .andWhere("j.status = :s", { s: PrintJobStatus.DONE })
      .andWhere("j.completedAt >= :d", { d: since })
      .getCount();
  }

  async countFailedSince(tenantId: string, since: Date): Promise<number> {
    return this.createQueryBuilder("j")
      .where("j.tenantId = :tid", { tid: tenantId })
      .andWhere("j.status = :s", { s: PrintJobStatus.FAILED })
      .andWhere("j.updatedAt >= :d", { d: since })
      .getCount();
  }

  async countGroupedByStatus(
    tenantId: string,
  ): Promise<Array<{ status: string; count: string }>> {
    return this.createQueryBuilder("j")
      .select("j.status", "status")
      .addSelect("COUNT(*)", "count")
      .where("j.tenantId = :tid", { tid: tenantId })
      .groupBy("j.status")
      .getRawMany();
  }

  async sumDonePages(tenantId: string, since?: Date): Promise<number> {
    const qb = this.createQueryBuilder("j")
      .select("COALESCE(SUM(j.totalPages), 0)", "total")
      .where("j.tenantId = :tid", { tid: tenantId })
      .andWhere("j.status = :s", { s: PrintJobStatus.DONE });
    if (since) qb.andWhere("j.completedAt >= :d", { d: since });
    const result = await qb.getRawOne<{ total: string }>();
    return parseInt(result?.total || "0", 10);
  }

  async deleteByTenantId(tenantId: string): Promise<number> {
    const r = await this.createQueryBuilder()
      .delete()
      .where("tenantId = :tid", { tid: tenantId })
      .execute();
    return r.affected ?? 0;
  }
}
