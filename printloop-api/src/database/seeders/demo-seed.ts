import { DataSource } from "typeorm";
import { Logger } from "@/common/logger";
import { ensureSystemSettings } from "@/config/settings";
import { TenantSeeder } from "./tenant.seeder";
import { UserSeeder, SEED_PASSWORD } from "./user.seeder";
import { KioskSeeder } from "./kiosk.seeder";
import { PricingSeeder } from "./pricing.seeder";
import { PrintJobSeeder } from "./print-job.seeder";
import { PromotionSeeder } from "./promotion.seeder";
import { GroupSessionSeeder } from "./group-session.seeder";
import { BlogSeeder } from "./blog.seeder";
import { OpsSeeder } from "./ops.seeder";

export async function seedDemoData(dataSource: DataSource, logger: Logger): Promise<void> {
  logger.info("Seeding the demo shop...");
  const shop = await new TenantSeeder().run(dataSource);
  logger.info(`  Created ${shop.name} (${shop.slug})`);

  logger.info("Seeding users...");
  const { platformAdmin, owner, shopAdmin, students } = await new UserSeeder().run(dataSource, shop);
  logger.info(`  Created 1 platform admin, 1 owner, 1 shop admin, ${students.length} students`);

  logger.info("Seeding kiosks...");
  const kiosks = await new KioskSeeder().run(dataSource, shop);
  logger.info(`  Created ${kiosks.length} kiosks`);

  logger.info("Seeding pricing...");
  const pricing = await new PricingSeeder().run(dataSource, shop);
  logger.info(`  Created ${pricing.length} price rows`);

  logger.info("Seeding print jobs and payments...");
  const { jobs, payments } = await new PrintJobSeeder().run(dataSource, shop, students, kiosks);
  logger.info(`  Created ${jobs.length} print jobs, ${payments.length} payments`);

  logger.info("Seeding promotions and a group session...");
  const promotions = await new PromotionSeeder().run(dataSource, shop);
  await new GroupSessionSeeder().run(dataSource, shop, students[0]!);
  logger.info(`  Created ${promotions.length} promotions, 1 group session`);

  logger.info("Seeding blog posts...");
  const posts = await new BlogSeeder().run(dataSource);
  logger.info(`  Created ${posts.length} blog posts`);

  logger.info("Seeding the audit log...");
  await new OpsSeeder().run(dataSource, shop, platformAdmin, shopAdmin, kiosks);
  logger.info("  Audit log seeded");

  logger.info("Seeding system settings defaults...");
  await ensureSystemSettings();
  logger.info("  Settings defaults seeded");

  logger.info("=== Seeding completed successfully ===");
  logger.info(`Login password for all seeded users: ${SEED_PASSWORD}`);
  logger.info(`Platform staff: ${platformAdmin.email}`);
  logger.info(`Shop owner: ${owner.email}  Shop admin: ${shopAdmin.email}`);
  logger.info("Students: student@printloop.ng, student2@printloop.ng ... student9@printloop.ng");
}
