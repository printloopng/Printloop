import { DataSource } from "typeorm";
import { RedisClient } from "@/common";
import { BaseRepository } from "@/repository/base.repository";
import { GroupParticipant } from "@/database/entities/groupParticipant.entity";

export class GroupParticipantRepository extends BaseRepository<GroupParticipant> {
  constructor(dataSource: DataSource, redis?: RedisClient) {
    super(GroupParticipant, dataSource, redis);
  }

  protected getAlias(): string {
    return "groupParticipant";
  }
}
