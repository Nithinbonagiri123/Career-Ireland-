import { expect, test } from '@playwright/test';

/**
 * Focused e2e tests for /candidates. Five checks: page header, view
 * toggle (grid vs table), grid card render, table render, and the
 * date-range + assignment filter chips. Complements smoke-all-routes.
 */

test.describe('/candidates', () => {
  test('page header shows title + description + Add button', async ({ page }) => {
    await page.goto('/candidates');
    await expect(page.getByRole('heading', { name: /candidates/i, level: 1 })).toBeVisible();
    await expect(page.getByText(/active talent pool/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /add candidate/i })).toBeVisible();
  });

  test('view toggle switches between Cards and Table', async ({ page }) => {
    await page.goto('/candidates?view=grid');
    // Cards toggle should read as "pressed" (aria-pressed=true).
    await expect(page.getByRole('link', { name: /^cards$/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // Next.js Link click is a client-side nav — but in dev/Turbopack the
    // URL only commits once the destination RSC is ready, which on a cold
    // /candidates?view=table can eat several seconds. waitForURL is
    // designed for this; toHaveURL polls on the string but doesn't wait
    // for navigation to be committed.
    await page.getByRole('link', { name: /^table$/i }).click();
    await page.waitForURL(/view=table/, { timeout: 15_000 });
  });

  test('grid view renders at least one candidate card (from the E2E seed)', async ({ page }) => {
    await page.goto('/candidates?view=grid');
    // The card body is a <Card> (not a link) with the candidate name in
    // an h3. Assert that at least one candidate-name heading renders —
    // the seed guarantees "E2E-Fixture CandidateOne" / "CandidateTwo".
    await expect(
      page
        .getByRole('heading', { level: 3, name: /CandidateOne|CandidateTwo|E2E-Fixture/i })
        .first(),
    ).toBeVisible();
  });

  test('table view renders the DataTable wrapper', async ({ page }) => {
    await page.goto('/candidates?view=table');
    await expect(page.locator('table')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /candidate/i })).toBeVisible();
  });

  test('date-range filter is present and default is Anytime', async ({ page }) => {
    await page.goto('/candidates');
    const anytime = page.getByRole('tab', { name: /anytime/i });
    await expect(anytime).toBeVisible();
    await expect(anytime).toHaveAttribute('aria-selected', 'true');
  });
});
