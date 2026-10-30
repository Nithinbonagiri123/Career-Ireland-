import { expect, test } from '@playwright/test';
import { seedImmigrationScenario } from './helpers/fixtures';

/**
 * Immigration Cases list — baseline coverage before the Stage 6G redesign.
 * Assertions match the seeded beneficiaries by name so they hold whatever
 * other cases exist locally.
 */

type Scenario = Awaited<ReturnType<typeof seedImmigrationScenario>>;
let seeded: Scenario;

test.beforeAll(async () => {
  seeded = await seedImmigrationScenario();
});
test.afterAll(async () => {
  await seeded.cleanup();
  expect(await seeded.remaining()).toBe(0);
});

test('global cards list shows every seeded case', async ({ page }) => {
  await page.goto('/immigration?assigned=all', { waitUntil: 'networkidle' });
  for (const name of Object.values(seeded.names)) {
    await expect(page.getByRole('heading', { level: 3, name })).toBeVisible();
  }
});

test('My Cases / Global Cases are tabs with a selected state', async ({ page }) => {
  await page.goto('/immigration?assigned=all', { waitUntil: 'networkidle' });
  const scope = page.getByRole('tablist', { name: 'Case scope' });
  await expect(scope.getByRole('tab', { name: /My Cases/ })).toHaveAttribute(
    'aria-selected',
    'false',
  );
  await expect(scope.getByRole('tab', { name: /Global Cases/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('table view lists a seeded beneficiary', async ({ page }) => {
  await page.goto('/immigration?assigned=all&view=table', { waitUntil: 'networkidle' });
  const table = page.locator('table').first();
  await expect(table).toBeVisible();
  await expect(table.getByText(seeded.names.submitted)).toBeVisible();
});

test('Open case dialog opens and closes', async ({ page }) => {
  await page.goto('/immigration?assigned=all', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /^open case$/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/open immigration case/i)).toBeVisible();
  await dialog.getByRole('button', { name: /^cancel$/i }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('no sideways page scroll on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/immigration?assigned=all', { waitUntil: 'networkidle' });
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(sw).toBeLessThanOrEqual(390);
});
