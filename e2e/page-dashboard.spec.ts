import { expect, test } from '@playwright/test';

/**
 * Focused e2e tests for the Main Dashboard. Complements `smoke-all-
 * routes.spec.ts` (which only asserts the page loads) with five checks
 * that guard the KPI grid, revenue pie+line, drill-downs, HR strip,
 * and trend chart wiring. Same shape as the sibling `page-*.spec.ts`
 * suites — one file per major page, five focused assertions each.
 */

test.describe('/dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
  });

  test('KPI strip renders all six workspace totals', async ({ page }) => {
    // Grid of 6 clickable KPI tiles — the underline / hint / value trio
    // is defined by StatChip, so we just count links inside the grid.
    const kpis = page
      .getByRole('link')
      .filter({ hasText: /candidates|leads|employers|requisitions|placements|expiring/i });
    await expect(kpis.first()).toBeVisible();
    expect(await kpis.count()).toBeGreaterThanOrEqual(6);
  });

  test('Revenue by business section shows the pie + line grid', async ({ page }) => {
    const section = page.getByRole('region', { name: /revenue by business/i });
    await expect(section).toBeVisible();
    // Each of the 3 sources renders its own tile (candidate services,
    // recruitment, immigration). Empty-state fallback still counts.
    await expect(section.getByText(/candidate services/i).first()).toBeVisible();
    await expect(section.getByText(/recruitment/i).first()).toBeVisible();
    await expect(section.getByText(/immigration/i).first()).toBeVisible();
  });

  test('30-day trends section renders three trend charts', async ({ page }) => {
    const trends = page.getByRole('region', { name: /30-day trends/i });
    await expect(trends).toBeVisible();
    // Each TrendChart has a title (New leads / Applications / Placements)
    await expect(trends.getByText(/new leads/i)).toBeVisible();
    await expect(trends.getByText(/applications/i)).toBeVisible();
    await expect(trends.getByText(/placements/i)).toBeVisible();
  });

  test('Drill-down cards render for the four watch-lists', async ({ page }) => {
    // Requisitions unfilled / Interviews this week / Overdue tasks /
    // Immigration expiring — either populated rows or the empty message.
    for (const heading of [
      /requisitions unfilled/i,
      /interviews this week/i,
      /overdue tasks/i,
      /immigration cases expiring/i,
    ]) {
      await expect(page.getByText(heading).first()).toBeVisible();
    }
  });

  test('HR "clocked in now" section is present', async ({ page }) => {
    const hr = page
      .getByRole('region', { name: /^hr$/i })
      .or(page.getByRole('region', { name: /people/i }));
    await expect(hr.first()).toBeVisible();
    // Working-now card either lists staff currently working or shows
    // its own empty state — either way the surface is visible.
    await expect(
      hr
        .first()
        .getByText(/clocked in|attendance|working/i)
        .first(),
    ).toBeVisible();
  });
});
