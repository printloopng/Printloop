import { DataSource } from "typeorm";
import bcrypt from "bcryptjs";
import { faker } from "@faker-js/faker";
import { User, UserRole } from "@/database/entities/user.entity";
import { Wallet } from "@/database/entities/wallet.entity";
import { Tenant } from "@/database/entities/tenant.entity";
import { TenantMember, TenantMemberRole } from "@/database/entities/tenantMember.entity";

export const SEED_PASSWORD = "Password1!";

const EXTRA_STUDENTS = 8;

export class UserSeeder {
  public async run(
    dataSource: DataSource,
    shop: Tenant
  ): Promise<{
    platformAdmin: User;
    owner: User;
    shopAdmin: User;
    students: User[];
  }> {
    const userRepo = dataSource.getRepository(User);
    const memberRepo = dataSource.getRepository(TenantMember);
    const walletRepo = dataSource.getRepository(Wallet);
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);

    const base = {
      salt: "bcrypt",
      passwordHash,
      isEmailVerified: true,
      adminPrivileges: [] as any
    };

    const platformAdmin = await userRepo.save(
      userRepo.create({
        ...base,
        tenantId: null,
        firstName: "Print",
        lastName: "Admin",
        email: "admin@printloop.app",
        phoneNumber: "+2348000000001",
        role: UserRole.SUPER_ADMIN
      })
    );

    const shopAdmin = await userRepo.save(
      userRepo.create({
        ...base,
        tenantId: shop.id,
        firstName: "Ops",
        lastName: "Manager",
        email: "ops@printloop.app",
        phoneNumber: "+2348000000002",
        role: UserRole.ADMIN,
        adminPrivileges: [
          "view_dashboard",
          "view_jobs",
          "requeue_jobs",
          "view_kiosks",
          "manage_kiosks"
        ] as any
      })
    );

    const owner = await userRepo.save(
      userRepo.create({
        ...base,
        tenantId: shop.id,
        firstName: "Shop",
        lastName: "Owner",
        email: "owner@printloop.app",
        phoneNumber: "+2348000000003",
        role: UserRole.ADMIN
      })
    );

    await memberRepo.save([
      memberRepo.create({ tenantId: shop.id, userId: owner.id, role: TenantMemberRole.OWNER }),
      memberRepo.create({ tenantId: shop.id, userId: shopAdmin.id, role: TenantMemberRole.ADMIN })
    ]);

    const demoStudent = await userRepo.save(
      userRepo.create({
        ...base,
        tenantId: null,
        firstName: "Demo",
        lastName: "Student",
        email: "student@printloop.app",
        phoneNumber: "+2348000000000",
        role: UserRole.USER
      })
    );

    const extraStudents: Partial<User>[] = [];
    for (let i = 0; i < EXTRA_STUDENTS; i++) {
      extraStudents.push({
        ...base,
        tenantId: null,
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        email: `student${i + 2}@printloop.app`,
        phoneNumber: `+234${faker.string.numeric(10)}`,
        role: UserRole.USER
      });
    }
    const savedExtras = await userRepo.save(userRepo.create(extraStudents));
    const students = [demoStudent, ...savedExtras];

    await walletRepo.save([
      ...students.map((s) => walletRepo.create({ tenantId: null, userId: s.id, balance: 0 })),
      walletRepo.create({ tenantId: shop.id, userId: shopAdmin.id, balance: 0 })
    ]);

    return { platformAdmin, owner, shopAdmin, students };
  }
}
