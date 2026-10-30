import { expect, test } from '@playwright/test';
import { seedImmigrationScenario } from './helpers/fixtures';

/**
 * Stage 6G Immigration list, dashboard and employer panel. Every check
 * targets the seeded fixture (unique tag in each beneficiary name), so it
 * holds whatever other cases exist locally.
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

const cardHeading = (page: import('@playwright/test').Page, name: string) =>
  page.getByRole('heading', { level: 3, name });

test('filters, stage tab and view live in the URL and survive reload', async ({ page }) => {
  await page.goto(`/immigration?assigned=all&q=${seeded.tag}`, { waitUntil: 'networkidle' });
  for (const name of Object.values(seeded.names))
    await expect(cardHeading(page, name)).toBeVisible();

  // Stage tab narrows to Submitted + Under review.
  await page
    .getByRole('navigation', { name: 'Case stage' })
    .getByRole('link', { name: /Application in progress/ })
    .click();
  await expect(page).toHaveURL(/stage=in_progress/);
  await expect(cardHeading(page, seeded.names.submitted)).toBeVisible();
  await expect(cardHeading(page, seeded.names.review)).toBeVisible();
  await expect(cardHeading(page, seeded.names.open)).toHaveCount(0);

  // Table view keeps the same filtered rows.
  await page.getByRole('link', { name: 'Table', exact: true }).click();
  await expect(page).toHaveURL(/view=table/);
  await expect(page).toHaveURL(/stage=in_progress/);
  await expect(page).toHaveURL(new RegExp(`q=${seeded.tag}`));
  const table = page.locator('table').first();
  await expect(table.getByRole('link', { name: seeded.names.submitted })).toBeVisible();
  await expect(table.getByText(seeded.names.open)).toHaveCount(0);

  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByRole('link', { name: 'Table', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(table.getByRole('link', { name: seeded.names.review })).toBeVisible();
  await expect(table.getByText(seeded.names.approved)).toHaveCount(0);
  await expect(page.getByPlaceholder(/Search name, sponsor/)).toHaveValue(seeded.tag);
});

test('changing view keeps the Global scope; changing scope keeps the view', async ({ page }) => {
  await page.goto('/immigration?assigned=all', { waitUntil: 'networkidle' });
  await page.getByRole('link', { name: 'Table', exact: true }).click();
  await expect(page).toHaveURL(/assigned=all/);
  await expect(page).toHaveURL(/view=table/);
  const scope = page.getByRole('tablist', { name: 'Case scope' });
  await expect(scope.getByRole('tab', { name: /Global Cases/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  await scope.getByRole('tab', { name: /My Cases/ }).click();
  await expect(page).not.toHaveURL(/assigned=/);
  await expect(page).toHaveURL(/view=table/);

  await page.getByRole('link', { name: 'Cards', exact: true }).click();
  await expect(page).not.toHaveURL(/view=table/);
  await scope.getByRole('tab', { name: /Global Cases/ }).click();
  await expect(page).toHaveURL(/assigned=all/);
});

test('dashboard tiles open the matching filtered list', async ({ page }) => {
  await page.goto('/dashboard/immigration', { waitUntil: 'networkidle' });
  const tiles = page.getByTestId('imm-dash-tile');
  await expect(tiles).toHaveCount(3);
  await expect(tiles.nth(0)).toHaveAttribute('href', '/immigration?assigned=all&stage=new');
  await expect(tiles.nth(1)).toHaveAttribute('href', '/immigration?assigned=all&stage=in_progress');
  await expect(tiles.nth(2)).toHaveAttribute('href', '/immigration?assigned=all&expiring=60');

  await tiles.nth(1).click();
  await expect(page).toHaveURL(/\/immigration\?assigned=all&stage=in_progress/);
  await expect(
    page
      .getByRole('navigation', { name: 'Case stage' })
      .getByRole('link', { name: /Application in progress/ }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(cardHeading(page, seeded.names.submitted)).toBeVisible();
  await expect(cardHeading(page, seeded.names.open)).toHaveCount(0);

  // The approved fixture case expires in 30 days → on the "Expiring" list.
  await page.goto('/dashboard/immigration', { waitUntil: 'networkidle' });
  await tiles.nth(2).click();
  await expect(page).toHaveURL(/expiring=60/);
  await expect(cardHeading(page, seeded.names.approved)).toBeVisible();
  await expect(cardHeading(page, seeded.names.rejected)).toHaveCount(0);
});

test('employer panel names each beneficiary and links to the case', async ({ page }) => {
  await page.goto(`/employers/${seeded.employerId}`, { waitUntil: 'networkidle' });
  const panel = page.getByTestId('employer-immigration-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByText(seeded.names.open)).toBeVisible();
  await expect(panel.getByText(seeded.names.approved)).toBeVisible();
  // Stage label, not the raw enum.
  await expect(panel.getByText('New Candidate')).toBeVisible();
  await expect(
    panel.getByRole('link', { name: `Open case for ${seeded.names.open}` }),
  ).toHaveAttribute('href', `/immigration/${seeded.cases.open}`);
});

test('keyboard focus is visible on case cards', async ({ page }) => {
  await page.goto(`/immigration?assigned=all&q=${seeded.tag}&sort=name`, {
    waitUntil: 'networkidle',
  });
  const title = cardHeading(page, seeded.names.approved).getByRole('link');
  await title.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(title).toBeFocused();
  const shadow = await title.evaluate((el) => getComputedStyle(el).boxShadow);
  const outline = await title.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(shadow !== 'none' || outline !== 'none').toBe(true);
});
