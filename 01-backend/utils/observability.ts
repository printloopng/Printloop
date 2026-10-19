import * as Sentry from '@sentry/node';

let initialized = false;

export function initSentryIfConfigured(): void {
  if (initialized) return;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.log('[sentry] disabled (no SENTRY_DSN set).');
    initialized = true;
    return;
  }
  try {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      release: process.env.APP_VERSION || undefined,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
      profilesSampleRate: Number(
        process.env.SENTRY_PROFILES_SAMPLE_RATE ?? 0,
      ),
      sendDefaultPii: false,
    });
    console.log(
      `[sentry] enabled (env=${process.env.NODE_ENV || 'development'}, ` +
        `release=${process.env.APP_VERSION || 'unset'}).`,
    );
    initialized = true;
  } catch (err) {
    console.warn('[sentry] init threw — continuing without error reporting:', err);
    initialized = true;
  }
}

export function reportError(err: unknown, context?: Record<string, unknown>): string | undefined {
  if (!process.env.SENTRY_DSN) return undefined;
  try {
    return Sentry.captureException(err, context ? { extra: context } : undefined);
  } catch {
    return undefined;
  }
}

export { Sentry };
