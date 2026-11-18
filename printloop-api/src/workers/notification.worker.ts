import { Worker, Job } from 'bullmq';
import { processNotification } from '@/workers/notification.handler';
import { bullmqConnection } from '@/workers/redisConnection';

const redisConnection = bullmqConnection();

export const notificationWorker = new Worker(
  'notifications',
  async (job: Job) => {
    try {
      const ok = await processNotification(job.name, job.data);
      if (!ok) {
        throw new Error(
          `Notification "${job.name}" failed to send (check RESEND_API_KEY / EMAIL_FROM)`,
        );
      }
      return { ok: true };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`Notification "${job.name}" failed to send: ${detail}`);
    }
  },
  { connection: redisConnection, concurrency: 5 },
);

notificationWorker.on('failed', (job, err) => {
  console.error(
    `[notification-worker] ${job?.name} ${job?.id} failed (attempt ${job?.attemptsMade}):`,
    err?.message,
  );
});
