import { createClient, type RedisClientType } from "redis";
import { Config } from "./index";

export const REDIS_ENABLED = Config.redis.enabled;

interface MinimalRedis {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  setEx(key: string, ttl: number, value: string): Promise<unknown>;
  del(key: string | string[]): Promise<unknown>;
  keys(pattern: string): Promise<string[]>;
  ttl(key: string): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  connect?(): Promise<unknown>;
  on?(event: string, cb: (...args: any[]) => void): unknown;
  sendCommand?(args: string[]): Promise<unknown>;
}

function createStub(): MinimalRedis {
  const store = new Map<string, { value: string; expiresAt: number }>();
  return {
    async get(key: string) {
      const item = store.get(key);
      if (!item) return null;
      if (Date.now() > item.expiresAt) {
        store.delete(key);
        return null;
      }
      return item.value;
    },
    async set(key: string, value: string) {
      store.set(key, {
        value,
        expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
      });
      return "OK";
    },
    async setEx(key: string, ttl: number, value: string) {
      store.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
      return "OK";
    },
    async del(key: string | string[]) {
      if (Array.isArray(key)) for (const k of key) store.delete(k);
      else store.delete(key);
      return 1;
    },
    async keys(pattern: string) {
      const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
      const results: string[] = [];
      const now = Date.now();
      for (const [key, item] of store.entries()) {
        if (now > item.expiresAt) {
          store.delete(key);
          continue;
        }
        if (regex.test(key)) results.push(key);
      }
      return results;
    },
    async ttl(key: string) {
      const item = store.get(key);
      if (!item) return -2;
      const remaining = Math.ceil((item.expiresAt - Date.now()) / 1000);
      if (remaining <= 0) {
        store.delete(key);
        return -2;
      }
      return remaining;
    },
    async incr(key: string) {
      const item = store.get(key);
      let val = 0;
      let expiresAt = Date.now() + 365 * 24 * 60 * 60 * 1000;
      if (item && Date.now() <= item.expiresAt) {
        val = Number(item.value) || 0;
        expiresAt = item.expiresAt;
      }
      val += 1;
      store.set(key, { value: String(val), expiresAt });
      return val;
    },
    async expire(key: string, seconds: number) {
      const item = store.get(key);
      if (!item) return 0;
      item.expiresAt = Date.now() + seconds * 1000;
      return 1;
    },
  };
}

function createRealClient(): RedisClientType {
  const url = Config.redis.url || `redis://${Config.redis.host}:${Config.redis.port}`;
  const client = createClient({ url });
  client.on("error", (err) => {
    console.warn("[redis]", err?.message || err);
  });
  void client.connect().catch((err) => {
    console.warn("[redis] connect failed", err?.message || err);
  });
  return client as RedisClientType;
}

export const redisClient: MinimalRedis = REDIS_ENABLED
  ? (createRealClient() as unknown as MinimalRedis)
  : createStub();

export { redis } from "./int-services";
