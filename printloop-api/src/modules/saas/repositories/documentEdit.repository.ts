import { DataSource } from "typeorm";
import { RedisClient } from "@/common";
import { BaseRepository } from "@/repository/base.repository";
import { DocumentEdit } from "@/database/entities/documentEdit.entity";

export class DocumentEditRepository extends BaseRepository<DocumentEdit> {
  constructor(dataSource: DataSource, redis?: RedisClient) {
    super(DocumentEdit, dataSource, redis);
  }

  protected getAlias(): string {
    return "documentEdit";
  }
}
