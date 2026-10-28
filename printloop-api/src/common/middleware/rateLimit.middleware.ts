import { Config } from '@/config';
import rateLimit, { ipKeyGenerator, type Options } from 'express-rate-limit';
import type { Request } from 'express';
import { RedisStore } from 'rate-limit-redis';
import { redisClient, REDIS_ENABLED } from '@/config/redis';

function ipToken(req: Request): string {
  return ipKeyGenerator(req.ip ?? '');
}

const redisStore = () => {
  if (!REDIS_ENABLED) return undefined;
  return new RedisStore({
    sendCommand: (...args: string[]) => (redisClient as any).sendCommand(args),
  });
};

function shouldSkip(): boolean {
  return Config.rateLimit.disabled || !REDIS_ENABLED;
}

function tenantKey(req: Request, base: string): string {
  const tid = req.tenant?.id || 'global';
  return `${tid}:${base}`;
}

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore(),
  skip: shouldSkip,
  keyGenerator: (req) => tenantKey(req, `api:${ipToken(req)}`),
  message: {
    success: false,
    message: 'Too many requests, please try again later',
    code: 'RATE_LIMIT_EXCEEDED',
  },
} as Partial<Options>);

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore(),
  skip: shouldSkip,
  keyGenerator: (req) => tenantKey(req, `login:${ipToken(req)}`),
  message: {
    success: false,
    message: 'Too many login attempts. Try again in 15 minutes.',
    code: 'LOGIN_RATE_LIMIT',
  },
} as Partial<Options>);

export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore(),
  skip: shouldSkip,
  keyGenerator: (req) => tenantKey(req, `signup:${ipToken(req)}`),
  message: {
    success: false,
    message: 'Too many signup attempts. Try again in an hour.',
    code: 'SIGNUP_RATE_LIMIT',
  },
} as Partial<Options>);

export const otpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore(),
  skip: shouldSkip,
  keyGenerator: (req) => tenantKey(req, `otp:${ipToken(req)}`),
  message: {
    success: false,
    message: 'Too many OTP requests. Try again later.',
    code: 'OTP_RATE_LIMIT',
  },
} as Partial<Options>);

export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore(),
  skip: shouldSkip,
  keyGenerator: (req) => tenantKey(req, `pwreset:${ipToken(req)}`),
  message: {
    success: false,
    message: 'Too many password reset requests. Try again in an hour.',
    code: 'PASSWORD_RESET_RATE_LIMIT',
  },
} as Partial<Options>);
