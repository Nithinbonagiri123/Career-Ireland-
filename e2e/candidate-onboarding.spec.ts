import { expect, test } from '@playwright/test';

/**
 * Smoke coverage for the new candidate-onboarding workflow. Full happy-path
 * (fill form + create + view invoice + view receipt) will land as a
 * follow-up once we have deterministic seeded currencies and a payment
 * catalog item — for now we prove:
 *  - the "Add candidate" button is on the list page
 *  - clicking it lands on /candidates/new?draft=<id>
 *  - the form renders all six sections
 *  - the sticky Create button is disabled until required fields are filled
 */

test('add-candidate button is visible on /candidates', async ({ page }) => {
  await page.goto('/candidates');
  await expect(page.getByRole('link', { name: /add candidate/i })).toBeVisible();
});

test('add-candidate lands on /candidates/new with a draft id and renders all sections', async ({
  page,
}) => {
  await page.goto('/candidates');
  await page.getByRole('link', { name: /add candidate/i }).click();
  await page.waitForURL(/\/candidates\/new\?draft=[0-9a-f-]+/i);

  await expect(page.getByRole('heading', { name: /add candidate/i })).toBeVisible();
  await expect(page.getByText(/personal & contact/i)).toBeVisible();
  await expect(page.getByText(/cover letter/i).first()).toBeVisible();
  await expect(page.getByText(/^documents$/i).first()).toBeVisible();
  // "Payment *" heading — asterisk marks it required.
  await expect(page.getByText(/^payment/i).first()).toBeVisible();

  await expect(page.getByLabel(/first name/i)).toBeVisible();
  await expect(page.getByLabel(/last name/i)).toBeVisible();
  await expect(page.getByLabel(/^amount/i)).toBeVisible();
});

test('sticky Create button is disabled until required fields are filled', async ({ page }) => {
  await page.goto('/candidates/new');
  await page.waitForURL(/\/candidates\/new\?draft=[0-9a-f-]+/i);

  const create = page.getByRole('button', { name: /create candidate/i });
  await expect(create).toBeDisabled();

  await page.getByLabel(/first name/i).fill('Priya');
  await page.getByLabel(/last name/i).fill('Patel');
  await page.getByLabel(/^amount/i).fill('750.00');
  // receivedAt already prefilled with today; currency defaults to EUR.

  await expect(create).toBeEnabled();
});
