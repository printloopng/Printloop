import { Queue, type QueueOptions } from 'bullmq';
import { REDIS_ENABLED } from '../config/redis';

export interface JobQueue {
  add(name: string, data?: any, opts?: any): Promise<{ id: string }>;
}

const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
};

const defaultJobOptions: QueueOptions['defaultJobOptions'] = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { age: 24 * 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

function makeQueue(name: string, options?: { deadLetterQueue?: { maxLen: number } }): JobQueue {
  if (REDIS_ENABLED) {
    const queueOptions: QueueOptions = {
      connection: redisConnection,
      defaultJobOptions,
    };
    return new Queue(name, queueOptions) as unknown as JobQueue;
  }
  return {
    async add(jobName: string) {
      console.log(`[queue:${name}] skipped "${jobName}" (Redis disabled)`);
      return { id: `noop-${Date.now()}` };
    },
  };
}

export const fileCleanupQueue = makeQueue('file-cleanup');
export const scheduledQueue = makeQueue('scheduled');
export const renderQueue = makeQueue('render');
export const webhookQueue = makeQueue('webhook-deliveries');
export const notificationQueue = makeQueue('notifications');

export async function initScheduledJobs(): Promise<void> {
  if (!REDIS_ENABLED) {
    console.log('Scheduled jobs: skipped (Redis disabled)');
    return;
  }
  await scheduledQueue.add(
    'auto-close-group-sessions',
    {},
    { repeat: { every: 15 * 60 * 1000 }, jobId: 'auto-close-group-sessions' }
  );
  await scheduledQueue.add(
    'mark-offline-kiosks',
    {},
    { repeat: { every: 5 * 60 * 1000 }, jobId: 'mark-offline-kiosks' }
  );
  await scheduledQueue.add(
    'daily-cleanup',
    {},
    { repeat: { pattern: '0 3 * * *' }, jobId: 'daily-cleanup' }
  );
  await scheduledQueue.add(
    'db-backup',
    {},
    { repeat: { pattern: '30 2 * * *' }, jobId: 'db-backup' }
  );
  await scheduledQueue.add(
    'process-payouts',
    {},
    { repeat: { pattern: '0 4 * * *' }, jobId: 'process-payouts' }
  );
  await scheduledQueue.add(
    'reconcile-stuck-renders',
    {},
    {
      repeat: { every: 10 * 60 * 1000 },
      jobId: 'reconcile-stuck-renders',
    },
  );
  console.log('✓ Scheduled jobs initialized');
}
