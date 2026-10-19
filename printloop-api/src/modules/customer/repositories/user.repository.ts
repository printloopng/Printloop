import { DataSource } from "typeorm";
import { RedisClient } from "@/common";
import { BaseRepository } from "@/repository/base.repository";
import { User, UserRole } from "@/database/entities/user.entity";

export class UserRepository extends BaseRepository<User> {
  constructor(dataSource: DataSource, redis?: RedisClient) {
    super(User, dataSource, redis);
  }

  protected getAlias(): string {
    return "user";
  }

  async findAdminByEmailLower(email: string): Promise<User | null> {
    return this.createQueryBuilder("u")
      .where("LOWER(u.email) = :email", { email })
      .andWhere("u.role IN (:...roles)", {
        roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
      })
      .getOne();
  }

  async countActiveLoginsSince(tenantId: string, since: Date): Promise<number> {
    return this.createQueryBuilder("u")
      .where("u.tenantId = :tid", { tid: tenantId })
      .andWhere("u.lastLoginAt >= :d", { d: since })
      .getCount();
  }

  async deleteByTenantId(tenantId: string): Promise<number> {
    const r = await this.createQueryBuilder()
      .delete()
      .where("tenantId = :tid", { tid: tenantId })
      .execute();
    return r.affected ?? 0;
  }
}
