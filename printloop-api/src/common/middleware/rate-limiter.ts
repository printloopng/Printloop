import { Request, Response, NextFunction } from "express";
import { RedisClient } from "@/common/redis/client";
import { TooManyRequestsError } from "@/common/errors";
import { Logger } from "@/common/logger";
import { config as AppConfig } from "@/config";

export interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  handler?: (req: Request, res: Response, next: NextFunction) => void;
}

export class RateLimiter {
  private redis: RedisClient;
  private logger: Logger;
  private options: Required<RateLimiterOptions>;

  constructor(redis: RedisClient, options: RateLimiterOptions) {
    this.redis = redis;
    this.logger = new Logger({ level: "info", service: "rate-limiter" });
    this.options = {
      windowMs: options.windowMs,
      maxRequests: options.maxRequests,
      message: options.message || "Too many requests, please try again later.",
      keyGenerator:
        options.keyGenerator || ((req) => this.getClientIdentifier(req)),
      skipSuccessfulRequests: options.skipSuccessfulRequests || false,
      skipFailedRequests: options.skipFailedRequests || false,
      handler:
        options.handler ||
        (() => {
          throw new TooManyRequestsError(this.options.message);
        }),
    };
  }

  private getClientIdentifier(req: Request): string {
    const userId = (req as any).user?.id;
    if (userId) {
      return `user:${userId}`;
    }
    return `ip:${req.ip || req.socket.remoteAddress || "unknown"}`;
  }

  middleware = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const key = `rate_limit:${this.options.keyGenerator(req)}`;
      const now = Date.now();
      const windowStart = now - this.options.windowMs;

      const results = await this.redis.redis
        .multi()
        .zremrangebyscore(key, 0, windowStart)
        .zadd(key, now, `${now}:${Math.random().toString(36).slice(2)}`)
        .zcard(key)
        .zrange(key, 0, 0, "WITHSCORES")
        .expire(key, Math.ceil(this.options.windowMs / 1000))
        .exec();

      const currentCount = Number(results?.[2]?.[1] ?? 0);
      const oldest = Number((results?.[3]?.[1] as string[] | undefined)?.[1] ?? now);

      if (currentCount > this.options.maxRequests) {
        const resetTime = oldest + this.options.windowMs;
        const retryAfter = Math.max(1, Math.ceil((resetTime - now) / 1000));

        res.setHeader("X-RateLimit-Limit", this.options.maxRequests.toString());
        res.setHeader("X-RateLimit-Remaining", "0");
        res.setHeader("X-RateLimit-Reset", resetTime.toString());
        res.setHeader("Retry-After", retryAfter.toString());

        this.logger.warn("Rate limit exceeded", { key, currentCount, limit: this.options.maxRequests });

        return this.options.handler(req, res, next);
      }

      res.setHeader("X-RateLimit-Limit", this.options.maxRequests.toString());
      res.setHeader("X-RateLimit-Remaining", Math.max(0, this.options.maxRequests - currentCount).toString());
      res.setHeader("X-RateLimit-Reset", (now + this.options.windowMs).toString());

      next();
    } catch (error) {
      if (error instanceof TooManyRequestsError) return next(error);
      this.logger.error("Rate limiter unavailable - allowing request", error as Error);
      next();
    }
  };
}

export const createRateLimiter = (
  redis: RedisClient,
  options: RateLimiterOptions,
): ((req: Request, res: Response, next: NextFunction) => Promise<void>) => {
  const limiter = new RateLimiter(redis, options);
  return limiter.middleware;
};

export const RateLimitPresets = {
  general: (redis: RedisClient) =>
    createRateLimiter(redis, {
      windowMs: AppConfig.rateLimit.windowMs,
      maxRequests: AppConfig.rateLimit.maxRequests,
      message: "Too many requests from this IP, please try again later.",
    }),

  auth: (redis: RedisClient) =>
    createRateLimiter(redis, {
      windowMs: 15 * 60 * 1000,
      maxRequests: 10,
      message: "Too many attempts, please try again later.",
      keyGenerator: (req) => {
        const email = req.body?.email || req.ip || "unknown";
        return `auth:${email}`;
      },
    }),

  perUser: (redis: RedisClient) =>
    createRateLimiter(redis, {
      windowMs: 60 * 1000,
      maxRequests: 240,
      message: "Too many requests, please slow down.",
      keyGenerator: (req) => `user-api:${(req as any).user?.id ?? req.ip}`,
    }),

  messageSend: (redis: RedisClient) =>
    createRateLimiter(redis, {
      windowMs: 60 * 1000,
      maxRequests: 60,
      message: "You're sending messages too quickly.",
      keyGenerator: (req) => `msg-send:${(req as any).user?.id ?? req.ip}`,
    }),

  callInitiate: (redis: RedisClient) =>
    createRateLimiter(redis, {
      windowMs: 10 * 60 * 1000,
      maxRequests: 30,
      message: "Too many call attempts, please try again later.",
      keyGenerator: (req) => `call-init:${(req as any).user?.id ?? req.ip}`,
    }),

  strict: (redis: RedisClient) =>
    createRateLimiter(redis, {
      windowMs: 15 * 60 * 1000,
      maxRequests: 5,
      message: "Rate limit exceeded. Please slow down.",
    }),

  fileUpload: (redis: RedisClient) =>
    createRateLimiter(redis, {
      windowMs: 15 * 60 * 1000,
      maxRequests: 30,
      message: "Too many file uploads, please try again later.",
    }),

  email: (redis: RedisClient) =>
    createRateLimiter(redis, {
      windowMs: 15 * 60 * 1000,
      maxRequests: 5,
      message: "Too many email requests, please try again later.",
    }),
};
