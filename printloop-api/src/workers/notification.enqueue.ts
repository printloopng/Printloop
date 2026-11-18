import { REDIS_ENABLED } from '@/config/redis';
import { notificationQueue } from '@/workers/queues';
import { processNotification } from '@/workers/notification.handler';

/**
 * Queue a notification for the worker. When Redis is off (tests / local without
 * Redis), process inline so callers and EmailService spies still work.
 */
export async function enqueueNotification(
  name: string,
  data: Record<string, unknown>,
): Promise<{ ok: boolean; id: string }> {
  if (!REDIS_ENABLED) {
    const ok = await processNotification(name, data);
    return { ok, id: `sync-${Date.now()}` };
  }

  const job = await notificationQueue.add(name, data);
  return { ok: true, id: String(job.id) };
}
