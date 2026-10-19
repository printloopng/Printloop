import * as Sentry from "@sentry/react";
import { useEffect } from "react";
import {
  useLocation,
  useNavigationType,
  createRoutesFromChildren,
  matchRoutes,
} from "react-router-dom";

let initialized = false;

export function initSentryIfConfigured(): void {
  if (initialized) return;
  initialized = true;
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) {
    // eslint-disable-next-line no-console
    console.log("[sentry] disabled (no VITE_SENTRY_DSN set).");
    return;
  }
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: (import.meta.env.VITE_APP_VERSION as string) || undefined,
    tracesSampleRate: Number(
      import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? 0.1,
    ),
    replaysOnErrorSampleRate: Number(
      import.meta.env.VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE ?? 0,
    ),
    replaysSessionSampleRate: Number(
      import.meta.env.VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE ?? 0,
    ),
    sendDefaultPii: false,
    integrations: [
      Sentry.reactRouterV6BrowserTracingIntegration({
        useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    beforeSend(event) {
      const url = event.request?.url ?? "";
      if (
        /\/(reset-password|login|find\/[^/]+)/.test(url) &&
        event.request
      ) {
        event.request.query_string = undefined;
        event.request.url = url.split("?")[0];
      }
      return event;
    },
  });
  // eslint-disable-next-line no-console
  console.log(`[sentry] enabled (env=${import.meta.env.MODE}).`);
}

export function setSentryUser(user: {
  id?: string;
  email?: string;
  role?: string;
} | null): void {
  if (!user) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({
    id: user.id,
    email: user.email,
  });
  if (user.role) Sentry.setTag("user.role", user.role);
}

export function setSentryTenant(slug: string | null): void {
  Sentry.setTag("tenant.slug", slug ?? "none");
}
