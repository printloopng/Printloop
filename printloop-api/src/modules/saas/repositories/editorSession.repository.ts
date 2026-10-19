import { DataSource } from "typeorm";
import { RedisClient } from "@/common";
import { BaseRepository } from "@/repository/base.repository";
import {
  EditorSession,
  EditorSessionStatus,
} from "@/database/entities/editorSession.entity";

export class EditorSessionRepository extends BaseRepository<EditorSession> {
  constructor(dataSource: DataSource, redis?: RedisClient) {
    super(EditorSession, dataSource, redis);
  }

  protected getAlias(): string {
    return "editorSession";
  }

  async expireActivePast(now: Date = new Date()): Promise<number> {
    const result = await this.createQueryBuilder()
      .update(EditorSession)
      .set({ status: EditorSessionStatus.EXPIRED })
      .where("status = :active", { active: EditorSessionStatus.ACTIVE })
      .andWhere("expiresAt < :now", { now })
      .execute();
    return result.affected || 0;
  }
}
