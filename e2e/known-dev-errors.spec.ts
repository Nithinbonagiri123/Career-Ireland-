import { expect, test } from '@playwright/test';
import {
  isKnownDevTimingError,
  isLocalNextDevServer,
  unexpectedBrowserErrors,
} from './helpers/known-dev-errors';

/**
 * Guards the one approved test exception (e2e/helpers/known-dev-errors.ts):
 * it matches only the exact documented React dev-only message, only on the
 * local dev server, and every other browser exception still fails.
 */

const KNOWN =
  "Failed to execute 'measure' on 'Performance': '​NewCandidatePage' cannot have a negative time stamp.";

test.describe('known dev-only error exception', () => {
  test('matches only the exact signature', () => {
    expect(isKnownDevTimingError(KNOWN)).toBe(true);
    expect(isKnownDevTimingError(KNOWN.replace('​', ''))).toBe(true);
    expect(isKnownDevTimingError(`Uncaught TypeError: ${KNOWN}`)).toBe(true);

    for (const other of [
      KNOWN.replace('NewCandidatePage', 'LeadDetailPage'),
      KNOWN.replace('negative time stamp', 'invalid time stamp'),
      `${KNOWN} extra`,
      "Failed to execute 'mark' on 'Performance': 'NewCandidatePage' cannot have a negative time stamp.",
      'TypeError: Cannot read properties of undefined (reading "id")',
      'NewCandidatePage crashed',
    ]) {
      expect(isKnownDevTimingError(other), other).toBe(false);
    }
  });

  test('is only ignored on the dev server; unrelated errors always remain', () => {
    const testInfo = test.info();
    const unrelated = 'TypeError: Something unrelated broke';
    expect(unexpectedBrowserErrors([KNOWN, unrelated], true, testInfo)).toEqual([unrelated]);
    expect(unexpectedBrowserErrors([KNOWN, unrelated], false)).toEqual([KNOWN, unrelated]);
    // Every ignored occurrence is recorded on the test (and logged).
    const notes = testInfo.annotations.filter((a) => a.type === 'known-dev-error');
    expect(notes).toHaveLength(1);
    expect(notes[0]?.description).toContain('NewCandidatePage');
  });

  test('an unrelated exception thrown in a real dev-server page still fails', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto('/candidates/new', { waitUntil: 'networkidle' });
    expect(await isLocalNextDevServer(page)).toBe(true);

    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error('Unrelated failure for the regression test');
      }, 0);
    });
    await expect.poll(() => pageErrors.length).toBeGreaterThan(0);

    const remaining = unexpectedBrowserErrors(pageErrors, true);
    expect(remaining).toContain('Unrelated failure for the regression test');
    // The route sweep's assertion would therefore fail on this page.
    expect(remaining.length).toBeGreaterThan(0);
  });

  test('outside the local dev server the known error is not ignored', async ({ page }) => {
    await page.setContent('<p>not the app</p>');
    expect(await isLocalNextDevServer(page)).toBe(false);
  });
});
