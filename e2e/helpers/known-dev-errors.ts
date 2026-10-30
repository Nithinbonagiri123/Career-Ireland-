import type { Page, TestInfo } from '@playwright/test';

/**
 * Known development-only browser error — TEST EXCEPTION, approved scope.
 *
 * WHY THIS EXISTS
 * React's development build (bundled with Next.js 16.4.3) records a
 * "Server Components" performance track in the browser. When a server
 * component's timing lands before the page's own time origin, React calls
 * `performance.measure()` with a negative end time and the browser throws:
 *
 *   Failed to execute 'measure' on 'Performance': 'NewCandidatePage'
 *   cannot have a negative time stamp.
 *
 * The code is in
 * node_modules/next/dist/compiled/react-server-dom-webpack/cjs/
 * react-server-dom-webpack-client.browser.development.js (start time is
 * clamped to 0, end time is not). The production client has none of this
 * code and the app's production build contains no `performance.measure`.
 * It has been seen since 27 Oct 2026 on several pages; the route sweep only
 * fails on /candidates/new because it treats every uncaught error as fatal.
 *
 * SCOPE (deliberately narrow)
 *  - the exact message for the `NewCandidatePage` component only;
 *  - only against a local Next.js development server;
 *  - every other uncaught browser exception still fails the test;
 *  - application code and console checks elsewhere are untouched.
 *
 * REMOVE THIS FILE (and its two call sites in comprehensive-qa.spec.ts)
 * once Next.js / React ship the upstream fix — e2e/known-dev-errors.spec.ts
 * will then be the only other place to update.
 */

/** Exact signature: optional zero-width space React prefixes to the name. */
const KNOWN_DEV_TIMING_ERROR =
  /^(?:Uncaught TypeError: )?Failed to execute 'measure' on 'Performance': '​?NewCandidatePage' cannot have a negative time stamp\.$/;

/** True only for the exact documented development-only message. */
export function isKnownDevTimingError(message: string): boolean {
  return KNOWN_DEV_TIMING_ERROR.test(message.trim());
}

/** Local development server only (localhost + the Next.js dev overlay). */
export async function isLocalNextDevServer(page: Page): Promise<boolean> {
  const url = new URL(page.url());
  if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') return false;
  // `nextjs-portal` is the dev overlay host element; production never renders it.
  return page.evaluate(() => document.querySelector('nextjs-portal') !== null).catch(() => false);
}

/**
 * Returns the messages that must still fail the test. The known error is
 * dropped only when `isDevServer` is true; each drop is logged and recorded
 * as a test annotation so it stays visible in reports.
 */
export function unexpectedBrowserErrors(
  messages: string[],
  isDevServer: boolean,
  testInfo?: TestInfo,
): string[] {
  return messages.filter((m) => {
    if (isDevServer && isKnownDevTimingError(m)) {
      const note = `Ignored known React dev-only timing error (see e2e/helpers/known-dev-errors.ts): ${m.trim()}`;
      console.log(`[known-dev-error] ${note}`);
      testInfo?.annotations.push({ type: 'known-dev-error', description: note });
      return false;
    }
    return true;
  });
}
