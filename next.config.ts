import { withSentryConfig } from '@sentry/nextjs/config';
import type { NextConfig } from 'next';

/**
 * Baseline security headers applied to every response.
 * CSP is intentionally omitted here — it needs a nonce strategy for Next's inline scripts
 * and hurts DX during rapid development. Add a strict CSP before public launch.
 */
const securityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

/**
 * Wrap the config with Sentry's build-time integration. Source-map upload and
 * bundle-analyse features are gated on SENTRY_AUTH_TOKEN so unconfigured
 * builds (dev, CI) don't try to contact sentry.io at build time — the wrapper
 * still emits a small runtime shim, which is fine.
 */
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Upload source maps only when we have the credentials + a DSN — otherwise
  // this whole step is skipped and the build stays hermetic.
  silent: !process.env.CI,
  telemetry: false,
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
});
