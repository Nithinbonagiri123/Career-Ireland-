import * as Sentry from '@sentry/nextjs';

/**
 * Edge-runtime Sentry init. Called for middleware (proxy.ts) and any
 * `runtime = "edge"` route. Same DSN-gated no-op pattern as the server
 * config — the middleware just runs without Sentry when unconfigured.
 */
const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    environment: process.env.NODE_ENV,
    sendDefaultPii: false,
  });
}
