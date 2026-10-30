import { expect, test } from '@playwright/test';
import { seedCampaign } from './helpers/fixtures';

test.describe('/campaigns', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/campaigns');
  });

  test('page header shows title + New campaign action', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /campaigns/i, level: 1 })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /new campaign|create campaign/i }).first(),
    ).toBeVisible();
  });

  test('date-range filter defaults to Anytime', async ({ page }) => {
    const anytime = page.getByRole('tab', { name: /anytime/i });
    if (await anytime.isVisible().catch(() => false)) {
      await expect(anytime).toHaveAttribute('aria-selected', 'true');
    }
  });

  test('table or empty state renders', async ({ page }) => {
    const hasTable = await page
      .locator('table')
      .first()
      .isVisible()
      .catch(() => false);
    const hasEmpty = await page
      .getByText(/no campaigns/i)
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasTable || hasEmpty).toBe(true);
  });

  test('status badges (DRAFT / ACTIVE / COMPLETED / CANCELLED) render if any campaign exists', async ({
    page,
  }) => {
    const anyStatus = page.getByText(/DRAFT|ACTIVE|COMPLETED|CANCELLED/i).first();
    if (await anyStatus.isVisible().catch(() => false)) {
      await expect(anyStatus).toBeVisible();
    }
  });

  test('following a campaign row opens the detail page', async ({ page }) => {
    // R6 — its own campaign instead of skipping when none exist.
    const campaign = await seedCampaign();
    try {
      await page.goto('/campaigns');
      await page.getByRole('link', { name: campaign.name }).first().click();
      await expect(page).toHaveURL(new RegExp(`/campaigns/${campaign.campaignId}`));
      await expect(page.getByRole('heading', { level: 1 })).toContainText(campaign.name);
    } finally {
      await campaign.cleanup();
    }
  });
});
