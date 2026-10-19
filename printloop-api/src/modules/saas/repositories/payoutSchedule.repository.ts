import { DataSource } from "typeorm";
import { RedisClient } from "@/common";
import { BaseRepository } from "@/repository/base.repository";
import { PayoutSchedule, PayoutCadence } from "@/database/entities/payoutSchedule.entity";

export class PayoutScheduleRepository extends BaseRepository<PayoutSchedule> {
  constructor(dataSource: DataSource, redis?: RedisClient) {
    super(PayoutSchedule, dataSource, redis);
  }

  protected getAlias(): string {
    return "payoutSchedule";
  }

  async findDueSchedules(dayOfWeek: number): Promise<PayoutSchedule[]> {
    return this.createQueryBuilder("s")
      .where(`(s.cadence = :daily) OR (s.cadence = :weekly AND s.dayOfWeek = :dow)`, {
        daily: PayoutCadence.DAILY,
        weekly: PayoutCadence.WEEKLY,
        dow: dayOfWeek,
      })
      .getMany();
  }
}
