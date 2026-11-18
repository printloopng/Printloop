import { Config } from '@/config';
import type { ConnectionOptions } from 'bullmq';

/**
 * BullMQ connection options. Prefer REDIS_URL (Render uses rediss://);
 * fall back to host/port. Workers require maxRetriesPerRequest: null.
 */
export function bullmqConnection(): ConnectionOptions {
  if (Config.redis.url) {
    const u = new URL(Config.redis.url);
    const port =
      Number(u.port) || (u.protocol === 'rediss:' ? 6380 : 6379);
    const username = u.username ? decodeURIComponent(u.username) : undefined;
    const password = u.password ? decodeURIComponent(u.password) : undefined;
    return {
      host: u.hostname || 'localhost',
      port,
      username: username || undefined,
      password: password || undefined,
      ...(u.protocol === 'rediss:' ? { tls: {} } : {}),
      maxRetriesPerRequest: null,
    };
  }

  return {
    host: Config.redis.host,
    port: Config.redis.port,
    username: Config.redis.username || undefined,
    password: Config.redis.password || undefined,
    maxRetriesPerRequest: null,
  };
}
