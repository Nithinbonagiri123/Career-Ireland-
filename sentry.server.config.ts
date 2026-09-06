import * as Sentry from '@sentry/nextjs';

/**
 * Server-runtime Sentry init. Called by @sentry/nextjs for API routes,
 * Server Actions, and Server Components. The `SENTRY_DSN` env var is
 * optional — when unset, `init` becomes a no-op that skips network calls.
 * That's what lets dev/CI/local Playwright runs stay quiet without a
 * dedicated Sentry project.
 */
const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // Prod defaults tuned for a low-volume MVP:
    //  - 10% traces (bump if you need more perf detail)
    //  - full errors (we're not paying for volume yet)
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    environment: process.env.NODE_ENV,
    // Don't send PII by default. Individual `Sentry.captureException` calls
    // can still attach a user via `Sentry.setUser`.
    sendDefaultPii: false,
    // Skip the auto-generated "server crashed" replays; we don't run the
    // browser replay bundle on the server anyway.
    integrations: (defaults) => defaults.filter((i) => i.name !== 'Console'),
  });
}
