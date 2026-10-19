import { Worker, Job } from 'bullmq';
import { Repository } from 'typeorm';
import { AppDataSource } from '@/config/data-source';
import { Kiosk, KioskStatus } from '@/database/entities/kiosk.entity';
import { GroupSessionService } from '@/modules/customer/services/groupSession.service';
import { SystemSetting } from '@/database/entities/systemSetting.entity';
import { processDuePayouts } from '@/modules/saas/services/payout.service';
import { reconcileStuckRenders } from '@/modules/public/services/renderEnqueue.service';
import { notifyOfflineKiosks } from '@/modules/saas/services/kioskAlert.service';
import { enforceAcceptWindow } from '@/modules/customer/services/acceptWindow.service';
import { runDatabaseBackup } from '@/modules/platform/services/backup.service';

const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
};

export const scheduledWorker = new Worker(
  'scheduled',
  async (job: Job) => {
    switch (job.name) {
      case 'auto-close-group-sessions':
        return await autoCloseGroupSessions();

      case 'mark-offline-kiosks':
        return await markOfflineKiosks();

      case 'daily-cleanup':
        return await dailyCleanup();

      case 'db-backup':
        return await runDatabaseBackup();

      case 'process-payouts':
        return await processPayoutsJob();

      case 'reconcile-stuck-renders':
        return await reconcileStuckRendersJob();

      case 'accept-window':
        return await enforceAcceptWindowJob(job.data?.printJobId);

      default:
        console.warn(`[Scheduled] Unknown job: ${job.name}`);
        return { skipped: true };
    }
  },
  { connection: redisConnection }
);

async function autoCloseGroupSessions(): Promise<{ closed: number }> {
  console.log('[Scheduled] Auto-closing expired group sessions...');
  const service = new GroupSessionService();
  const closed = await service.autoCloseExpiredSessions();
  console.log(`[Scheduled] Auto-closed ${closed} sessions`);
  return { closed };
}

async function markOfflineKiosks(): Promise<{ markedOffline: number }> {
  console.log('[Scheduled] Checking for offline kiosks...');

  const kioskRepo: Repository<Kiosk> = AppDataSource.getRepository(Kiosk);
  const settingRepo: Repository<SystemSetting> = AppDataSource.getRepository(SystemSetting);

  const setting = await settingRepo.findOne({
    where: { key: 'kiosk_offline_threshold_minutes' },
  });
  const thresholdMinutes = setting ? parseInt(setting.value) : 15;

  const cutoff = new Date();
  cutoff.setMinutes(cutoff.getMinutes() - thresholdMinutes);

  const demoCampuses = ['Demo', 'Akoka', 'Yaba', 'UNILAG', 'Bariga'];

  await kioskRepo
    .createQueryBuilder()
    .update(Kiosk)
    .set({ status: KioskStatus.ACTIVE })
    .where('status = :offline AND (campus IN (:...demoCampuses) OR name LIKE :demoName)', {
      offline: KioskStatus.OFFLINE,
      demoCampuses,
      demoName: '%demo%'
    })
    .execute();

  const aboutToGoOffline = await kioskRepo.find({
    where: [{ status: KioskStatus.ACTIVE }],
    select: ['id', 'tenantId', 'lastSeenAt'],
  });
  const transitioningIds = aboutToGoOffline
    .filter(
      (k) =>
        !k.lastSeenAt || k.lastSeenAt < cutoff &&
        !demoCampuses.includes((k as any).campus ?? '') &&
        !((k as any).name ?? '').toLowerCase().includes('demo'),
    )
    .map((k) => k.id);

  const result = await kioskRepo
    .createQueryBuilder()
    .update(Kiosk)
    .set({ status: KioskStatus.OFFLINE })
    .where('status = :active', { active: KioskStatus.ACTIVE })
    .andWhere('(lastSeenAt IS NULL OR lastSeenAt < :cutoff)', { cutoff })
    .andWhere('campus NOT IN (:...demoCampuses) AND name NOT LIKE :demoName', {
      demoCampuses,
      demoName: '%demo%'
    })
    .execute();

  if (transitioningIds.length > 0) {
    notifyOfflineKiosks(transitioningIds).catch((err) =>
      console.error('[Scheduled] kioskAlert notification failed:', err),
    );
  }

  console.log(`[Scheduled] Marked ${result.affected} kiosks offline`);
  return { markedOffline: result.affected || 0 };
}

async function enforceAcceptWindowJob(printJobId: string | undefined): Promise<any> {
  if (!printJobId) return { skipped: true };
  const result = await enforceAcceptWindow(printJobId);
  console.log(
    `[Scheduled] Accept window ${result.action}${
      result.toTenantId ? ` → ${result.toTenantId}` : ''
    } (job ${printJobId})`,
  );
  return result;
}

async function reconcileStuckRendersJob(): Promise<any> {
  console.log('[Scheduled] Reconciling stuck-RENDERING jobs...');
  const result = await reconcileStuckRenders();
  console.log(
    `[Scheduled] Reconcile: found=${result.found} reenqueued=${result.reenqueued} recovered=${result.recovered} failed=${result.failed}`,
  );
  return result;
}

async function processPayoutsJob(): Promise<any> {
  console.log('[Scheduled] Processing due payouts...');
  const result = await processDuePayouts();
  console.log(
    `[Scheduled] Payouts: considered=${result.considered} processed=${result.processed} skipped=${result.skipped} failed=${result.failed}`,
  );
  return result;
}

async function dailyCleanup(): Promise<any> {
  console.log('[Scheduled] Running daily cleanup...');

  return { ranAt: new Date().toISOString() };
}

scheduledWorker.on('completed', (job) => {
  console.log(`[Scheduled] ${job.name} completed`);
});

scheduledWorker.on('failed', (job, err) => {
  console.error(`[Scheduled] ${job?.name} failed:`, err);
});
