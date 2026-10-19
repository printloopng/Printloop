import { DataSource } from "typeorm";
import { RedisClient } from "@/common";
import { BaseRepository } from "@/repository/base.repository";
import { Kiosk, KioskStatus } from "@/database/entities/kiosk.entity";

export class KioskRepository extends BaseRepository<Kiosk> {
  constructor(dataSource: DataSource, redis?: RedisClient) {
    super(Kiosk, dataSource, redis);
  }

  protected getAlias(): string {
    return "kiosk";
  }

  async markOfflineAlertsSent(ids: string[]): Promise<void> {
    if (!ids.length) return;
    await this.createQueryBuilder()
      .update(Kiosk)
      .set({ lastOfflineAlertAt: new Date() })
      .where("id IN (:...ids)", { ids })
      .execute();
  }

  async countGroupedByStatus(
    tenantId: string,
  ): Promise<Array<{ status: string; count: string }>> {
    return this.createQueryBuilder("k")
      .select("k.status", "status")
      .addSelect("COUNT(*)", "count")
      .where("k.tenantId = :tid", { tid: tenantId })
      .groupBy("k.status")
      .getRawMany();
  }

  async listFiltered(filters?: {
    tenantId?: string | null;
    status?: KioskStatus;
    campus?: string;
    location?: string;
  }): Promise<Kiosk[]> {
    const query = this.createQueryBuilder("kiosk");
    if (filters?.tenantId) {
      query.andWhere("kiosk.tenantId = :__tid", { __tid: filters.tenantId });
    }
    if (filters?.status) {
      query.andWhere("kiosk.status = :status", { status: filters.status });
    }
    if (filters?.campus) {
      query.andWhere("kiosk.campus = :campus", { campus: filters.campus });
    }
    if (filters?.location) {
      query.andWhere("kiosk.location LIKE :location", {
        location: `%${filters.location}%`,
      });
    }
    query.orderBy("kiosk.createdAt", "DESC");
    return query.getMany();
  }

  async findOffline(minutesOffline: number = 15): Promise<Kiosk[]> {
    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - minutesOffline);
    return this.createQueryBuilder("kiosk")
      .where("kiosk.status != :disabled", { disabled: KioskStatus.DISABLED })
      .andWhere("(kiosk.lastSeenAt IS NULL OR kiosk.lastSeenAt < :cutoffTime)", {
        cutoffTime,
      })
      .getMany();
  }
}
