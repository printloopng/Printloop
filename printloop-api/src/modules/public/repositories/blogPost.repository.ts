import { DataSource } from "typeorm";
import { RedisClient } from "@/common";
import { BaseRepository } from "@/repository/base.repository";
import { BlogPost } from "@/database/entities/blogPost.entity";

export class BlogPostRepository extends BaseRepository<BlogPost> {
  constructor(dataSource: DataSource, redis?: RedisClient) {
    super(BlogPost, dataSource, redis);
  }

  protected getAlias(): string {
    return "blogPost";
  }
}
