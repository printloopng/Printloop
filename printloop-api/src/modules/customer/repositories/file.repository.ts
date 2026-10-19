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
      .innerJoin("f.printJob", "pj")
      .where("pj.userId = :uid", { uid: userId })
      .getMany();
  }
}
