import { Config } from '@/config';
import * as Sentry from '@sentry/node';

let initialized = false;

export function initSentryIfConfigured(): void {
  if (initialized) return;
  const dsn = Config.sentry.dsn;
  if (!dsn) {
    console.log('[sentry] disabled (no SENTRY_DSN set).');
    initialized = true;
    return;
  }
  try {
    Sentry.init({
      dsn,
      environment: Config.nodeEnv,
      release: Config.service.version,
      tracesSampleRate: Config.sentry.tracesSampleRate,
      profilesSampleRate: Config.sentry.profilesSampleRate,
      sendDefaultPii: false,
    });
    console.log(
      `[sentry] enabled (env=${Config.nodeEnv}, release=${Config.service.version}).`,
    );
    initialized = true;
  } catch (err) {
    console.warn('[sentry] init threw — continuing without error reporting:', err);
    initialized = true;
  }
}

export function reportError(err: unknown, context?: Record<string, unknown>): string | undefined {
  if (!Config.sentry.dsn) return undefined;
  try {
    return Sentry.captureException(err, context ? { extra: context } : undefined);
  } catch {
    return undefined;
  }
}

export { Sentry };
