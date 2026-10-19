import { Worker, Job } from 'bullmq';
import { deliverWebhook } from '../services/tenantWebhook.service';

const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
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
