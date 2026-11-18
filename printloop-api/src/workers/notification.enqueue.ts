import { Config } from '@/config';
import { REDIS_ENABLED } from '@/config/redis';
import { notificationQueue } from '@/workers/queues';
import { processNotification } from '@/workers/notification.handler';

export type EnqueueNotificationOptions = {
  /**
   * When Redis is off, wait for the inline send to finish (invite
   * emailSent, tests). Default: await in test, fire-and-forget elsewhere
   * so HTTP handlers never hang on SMTP/SMS.
   */
  awaitDelivery?: boolean;
};

/**
 * Queue a notification for the worker. When Redis is off (tests / local
 * without Redis), process inline.
 */
export async function enqueueNotification(
  name: string,
  data: Record<string, unknown>,
  opts: EnqueueNotificationOptions = {},
): Promise<{ ok: boolean; id: string }> {
  if (!REDIS_ENABLED) {
    const awaitDelivery = opts.awaitDelivery ?? Config.nodeEnv === 'test';
    if (awaitDelivery) {
      const ok = await processNotification(name, data);
      return { ok, id: `sync-${Date.now()}` };
    }
    const id = `async-${Date.now()}`;
    void processNotification(name, data).catch((err) =>
      console.error(`[notification] inline "${name}" failed:`, err),
    );
    return { ok: true, id };
  }

  try {
    const job = await notificationQueue.add(name, data);
    return { ok: true, id: String(job.id) };
  } catch (err) {
    console.error(`[notification] failed to queue "${name}":`, err);
    // Fall back to inline send so auth/signup still works if Redis/BullMQ is unhealthy.
    const ok = await processNotification(name, data);
    return { ok, id: `fallback-${Date.now()}` };
  }
}
