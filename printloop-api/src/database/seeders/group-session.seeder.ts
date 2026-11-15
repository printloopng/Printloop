import { DataSource } from "typeorm";
import { GroupSession, GroupSessionStatus } from "@/database/entities/groupSession.entity";
import { Tenant } from "@/database/entities/tenant.entity";
import { User } from "@/database/entities/user.entity";

export class GroupSessionSeeder {
  public async run(dataSource: DataSource, shop: Tenant, host: User): Promise<GroupSession> {
    const repo = dataSource.getRepository(GroupSession);

    return repo.save(
      repo.create({
        tenantId: shop.id,
        hostUserId: host.id,
        groupName: "CSC 301 Assignment 2",
        deadline: new Date(Date.now() + 8 * 3600 * 1000),
        status: GroupSessionStatus.OPEN,
        shareUrl: "/groups/csc-301-assignment-2/join",
        defaultOptions: {
          paper: "A4",
          color: "bw",
          sided: "double",
          qualityDpi: 300,
          enforce: true
        }
      })
    );
  }
}
