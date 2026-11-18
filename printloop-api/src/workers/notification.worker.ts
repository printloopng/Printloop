import { Config } from '@/config';
import { Worker, Job } from 'bullmq';
import { processNotification } from '@/workers/notification.handler';

const redisConnection = {
  host: Config.redis.host,
  port: Config.redis.port,
  password: Config.redis.password || undefined,
};

export const notificationWorker = new Worker(
  'notifications',
  async (job: Job) => {
    const ok = await processNotification(job.name, job.data);
    if (!ok) {
      throw new Error(`Notification "${job.name}" failed to send`);
    }
    return { ok: true };
  },
  { connection: redisConnection, concurrency: 5 },
);

notificationWorker.on('failed', (job, err) => {
  console.error(
    `[notification-worker] ${job?.name} ${job?.id} failed (attempt ${job?.attemptsMade}):`,
    err?.message,
  );
});
