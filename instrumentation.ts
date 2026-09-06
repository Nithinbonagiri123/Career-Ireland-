/**
 * Next.js instrumentation entry point. Called once per runtime at server boot.
 * We dispatch to the matching Sentry init file based on the runtime string
 * Next.js provides — Sentry's own docs recommend this exact shape for
 * @sentry/nextjs >= 8.
 *
 * All init is DSN-gated inside each config file, so this file is safe to
 * leave in place even when Sentry is not configured.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  } else if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// Next.js 15+ hooks a hostname into `onRequestError` so exception context
// includes URL + method + status. @sentry/nextjs exports the helper as
// `captureRequestError`; alias it to the name Next.js expects.
export { captureRequestError as onRequestError } from '@sentry/nextjs';
