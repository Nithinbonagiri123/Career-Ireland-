import * as Sentry from '@sentry/nextjs';

/**
 * Browser-runtime Sentry init. Loaded once by the app shell.
 *
 * Uses NEXT_PUBLIC_SENTRY_DSN so the value survives static compilation.
 * A missing DSN skips init entirely — the browser bundle stays quiet and
 * no network calls are made.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    environment: process.env.NODE_ENV,
    sendDefaultPii: false,
    // Skip session replay for now — bigger bundle, extra cost, low value
    // until we have real customer-facing incidents to reproduce.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
