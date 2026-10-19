import { DataSource } from "typeorm";
import { RedisClient } from "@/common";
import { BaseRepository } from "@/repository/base.repository";
import {
  GroupSession,
  GroupSessionStatus,
} from "@/database/entities/groupSession.entity";

export class GroupSessionRepository extends BaseRepository<GroupSession> {
  constructor(dataSource: DataSource, redis?: RedisClient) {
    super(GroupSession, dataSource, redis);
  }

  protected getAlias(): string {
    return "groupSession";
  }

  async countCreatedSince(tenantId: string, since: Date): Promise<number> {
    return this.createQueryBuilder("s")
      .where("s.tenantId = :tid", { tid: tenantId })
      .andWhere("s.createdAt >= :d", { d: since })
      .getCount();
  }

  async findOpenPastDeadline(now: Date = new Date()): Promise<GroupSession[]> {
    return this.createQueryBuilder("session")
      .where("session.status = :status", { status: GroupSessionStatus.OPEN })
      .andWhere("session.deadline < :now", { now })
      .getMany();
  }
}
