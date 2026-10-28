import { Config } from '@/config';
import { Worker, Job } from 'bullmq';
import { deliverWebhook } from '@/modules/saas/services/tenantWebhook.service';

const redisConnection = {
  host: Config.redis.host,
  port: Config.redis.port,
  password: Config.redis.password || undefined,
};

export const webhookWorker = new Worker(
  'webhook-deliveries',
  async (job: Job) => {
    const { webhookId, url, secret, event, body } = job.data;
    await deliverWebhook({ webhookId, url, secret, event, body });
    return { delivered: true };
  },
  { connection: redisConnection, concurrency: 5 },
);

webhookWorker.on('failed', (job, err) => {
  console.error(
    `[webhook-worker] delivery ${job?.id} failed (attempt ${job?.attemptsMade}):`,
    err?.message,
  );
});
