import * as Sentry from '@sentry/node';
import { Config } from '@/config';

let sentryInitialized = false;

export function initSentry(): void {
  if (sentryInitialized) return;
  if (!Config.sentry.dsn) {
    console.log('[Sentry] DSN not configured — error reporting disabled');
    return;
  }

  Sentry.init({
    dsn: Config.sentry.dsn,
    environment: Config.nodeEnv,
    release: Config.service.version,
    tracesSampleRate: Config.sentry.tracesSampleRate,
    profilesSampleRate: Config.sentry.profilesSampleRate,
    integrations: [
      Sentry.httpIntegration(),
      Sentry.expressIntegration(),
    ],
    beforeSend(event, hint) {
      if (Config.nodeEnv !== 'production') {
        const error = hint.originalException;
        if (error instanceof Error) {
          if (error.message.includes('ValidationError') ||
              error.message.includes('Unauthorized') ||
              error.message.includes('RATE_LIMIT')) {
            return null;
          }
        }
      }
      return event;
    },
    initialScope: {
      tags: {
        service: 'printloop-api',
      },
    },
  });

  sentryInitialized = true;
  console.log('[Sentry] Initialized');
}

export function captureException(error: unknown, context?: Record<string, unknown>): string | undefined {
  if (!sentryInitialized || !Config.sentry.dsn) return undefined;
  return Sentry.captureException(error, { extra: context });
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info', context?: Record<string, unknown>): string | undefined {
  if (!sentryInitialized || !Config.sentry.dsn) return undefined;
  return Sentry.captureMessage(message, { level, extra: context });
}

export function setUserContext(user: { id: string; email?: string; role?: string; tenantId?: string }): void {
  if (!sentryInitialized || !Config.sentry.dsn) return;
  Sentry.setUser(user);
}

export function clearUserContext(): void {
  if (!sentryInitialized || !Config.sentry.dsn) return;
  Sentry.setUser(null);
}

export function addBreadcrumb(breadcrumb: { category: string; message: string; level?: 'info' | 'warning' | 'error' }): void {
  if (!sentryInitialized || !Config.sentry.dsn) return;
  Sentry.addBreadcrumb(breadcrumb);
}

export function startSpan(name: string, op: string, callback: (span: unknown) => void): void {
  if (!sentryInitialized || !Config.sentry.dsn) {
    callback({} as any);
    return;
  }
  Sentry.startSpan({ name, op }, (span) => {
    callback(span);
  });
}

export const sentryMiddleware = Sentry.expressErrorHandler();