import { Config } from '@/config';
import { AppDataSource } from '@/config/data-source';
import { Logger } from '@/common/logger';
import { ensureSystemSettings } from '@/config/settings';
import { User } from '@/database/entities/user.entity';
import { seedDemoData } from './demo-seed';

export { DEMO_SHOP_SLUG } from './tenant.seeder';

export async function runSeed(): Promise<void> {
  await ensureSystemSettings();

  if ((await AppDataSource.getRepository(User).count()) > 0) {
    console.log('Seed: users already present, skipping.');
    return;
  }

  if (!Config.seedDemo) {
    console.log(
      'Seed: empty DB but demo seeding is off. Run `npm run db-seed:setup` with BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD set to create the first PrintLoop staff account.',
    );
    return;
  }

  await seedDemoData(AppDataSource, new Logger({ level: 'info', service: 'seed' }));
}
