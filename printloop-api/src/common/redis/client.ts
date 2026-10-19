import { Redis } from "ioredis";
import { Logger } from "../logger";
import { Config } from '@/config';

export interface RedisClientOptions {
  keyPrefix?: string;
  ttl?: number;
}

export class RedisClient {
  public redis: Redis;
  private logger: Logger;
  private keyPrefix: string;
  private defaultTtl: number;

  constructor(options: RedisClientOptions = {}) {
    this.logger = new Logger({ level: "info", service: "redis-client" });
    this.keyPrefix = options.keyPrefix || "";
    this.defaultTtl = options.ttl || 3600;

    this.redis = Config.redis.url
      ? new Redis(Config.redis.url, {
          maxRetriesPerRequest: 2,
          commandTimeout: 3000,
          retryStrategy: (times) => Math.min(times * 200, 3000),
          lazyConnect: true,
        })
      : new Redis({
          host: Config.redis.host,
          port: Config.redis.port,
          password: Config.redis.password || undefined,
          db: Config.redis.db,
          username: Config.redis.username || undefined,
          maxRetriesPerRequest: 2,
          commandTimeout: 3000,
          retryStrategy: (times) => Math.min(times * 200, 3000),
          lazyConnect: true,
        });

    this.redis.on("error", (error) => {
      this.logger.error("Redis connection error", error);
    });
    this.redis.on("connect", () => {
      this.logger.info("Redis connected");
    });
  }

  private getKey(key: string): string {
    return this.keyPrefix ? `${this.keyPrefix}:${key}` : key;
  }

  async setJSON(key: string, value: any, ttl?: number): Promise<void> {
    const cacheKey = this.getKey(key);
    const serialized = JSON.stringify(value);
    const expiry = ttl || this.defaultTtl;

    await this.redis.setex(cacheKey, expiry, serialized);
    this.logger.debug(`Set JSON key: ${cacheKey}`);
  }

  async getJSON<T = any>(key: string): Promise<T | null> {
    const cacheKey = this.getKey(key);
    const value = await this.redis.get(cacheKey);

    if (!value) {
      this.logger.debug(`Cache miss for key: ${cacheKey}`);
      return null;
    }

    try {
      const parsed = JSON.parse(value);
      this.logger.debug(`Cache hit for key: ${cacheKey}`);
      return parsed;
    } catch (error: any) {
      this.logger.error(`Failed to parse JSON for key ${cacheKey}`, undefined, {
        error,
      });
      await this.redis.del(cacheKey);
      return null;
    }
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    const cacheKey = this.getKey(key);
    const expiry = ttl || this.defaultTtl;

    await this.redis.setex(cacheKey, expiry, value);
    this.logger.debug(`Set key: ${cacheKey}`);
  }

  async get(key: string): Promise<string | null> {
    const cacheKey = this.getKey(key);
    const value = await this.redis.get(cacheKey);

    if (value) {
      this.logger.debug(`Cache hit for key: ${cacheKey}`);
    } else {
      this.logger.debug(`Cache miss for key: ${cacheKey}`);
    }

    return value;
  }

  async del(key: string): Promise<number> {
    const cacheKey = this.getKey(key);
    const result = await this.redis.del(cacheKey);
    this.logger.debug(`Deleted key: ${cacheKey}`);
    return result;
  }

  async incr(key: string): Promise<number> {
    const cacheKey = this.getKey(key);
    const n = await this.redis.incr(cacheKey);
    this.logger.debug(`INCR ${cacheKey} -> ${n}`);
    return n;
  }

  async exists(key: string): Promise<boolean> {
    const cacheKey = this.getKey(key);
    const result = await this.redis.exists(cacheKey);
    return result === 1;
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    const cacheKey = this.getKey(key);
    const result = await this.redis.expire(cacheKey, seconds);
    return result === 1;
  }

  async keys(pattern: string): Promise<string[]> {
    const searchPattern = this.keyPrefix
      ? `${this.keyPrefix}:${pattern}`
      : pattern;
    return this.redis.keys(searchPattern);
  }

  async deleteByPattern(pattern: string): Promise<number> {
    const match = this.keyPrefix ? `${this.keyPrefix}:${pattern}` : pattern;
    let removed = 0;
    const stream = this.redis.scanStream({ match, count: 200 });
    for await (const batch of stream as AsyncIterable<string[]>) {
      if (batch.length === 0) continue;
      removed += await this.redis.unlink(...batch);
    }
    return removed;
  }

  async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.redis.set(this.getKey(key), value, "EX", ttlSeconds, "NX");
    return result === "OK";
  }

  async delIfEquals(key: string, value: string): Promise<boolean> {
    const script =
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
    const result = await this.redis.eval(script, 1, this.getKey(key), value);
    return result === 1;
  }

  async pfadd(key: string, member: string, ttl?: number): Promise<void> {
    const cacheKey = this.getKey(key);
    await this.redis.pfadd(cacheKey, member);
    if (ttl) await this.redis.expire(cacheKey, ttl);
  }

  async pfcount(keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    return this.redis.pfcount(...keys.map((key) => this.getKey(key)));
  }

  async ping(): Promise<string> {
    return this.redis.ping();
  }

  async disconnect(): Promise<void> {
    await this.redis.disconnect();
    this.logger.info("Redis disconnected");
  }

  getRedis(): Redis {
    return this.redis;
  }
}
