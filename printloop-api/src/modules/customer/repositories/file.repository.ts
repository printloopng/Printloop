import { DataSource } from "typeorm";
import { RedisClient } from "@/common";
import { BaseRepository } from "@/repository/base.repository";
import { File } from "@/database/entities/file.entity";

export class FileRepository extends BaseRepository<File> {
  constructor(dataSource: DataSource, redis?: RedisClient) {
    super(File, dataSource, redis);
  }

  protected getAlias(): string {
    return "file";
  }

  async findByPrintJobUserId(userId: string): Promise<File[]> {
    return this.createQueryBuilder("f")
      .where(
        `f.id IN (SELECT pj."fileId" FROM print_jobs pj WHERE pj."userId" = :uid)
         OR f.id IN (SELECT it."fileId" FROM print_job_items it
                     INNER JOIN print_jobs pj2 ON pj2.id = it."printJobId"
                     WHERE pj2."userId" = :uid)`,
        { uid: userId },
      )
      .getMany();
  }
}
