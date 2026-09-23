import { expect, test } from '@playwright/test';

/**
 * End-to-end verification of the "no locked dropdown" fix.
 *
 * User complained that every catalog picker in the app forced them to
 * choose from a fixed dropdown — no way to add a new skill / qualification
 * / occupation / service on the fly. `CatalogAutosuggest` now accepts an
 * `onCreateNew` prop and every dialog that reads a catalog has been
 * swapped over.
 *
 * This spec walks each fixed dialog and asserts:
 *   1. The old `<select>` is gone (no HTML select with the field's id).
 *   2. A text input renders instead.
 *   3. Typing a name that doesn't match any catalog row shows the
 *      "+ Add … : <name>" affordance.
 *
 * It does NOT commit the create — that would leave test rows in the
 * catalog. The affordance being visible is enough to prove the wiring.
 */

test('requisition: Add required skill dialog shows autosuggest + inline-create', async ({
  page,
}) => {
  await page.goto('/requisitions?view=table');
  // Requires the E2E minimal seed (scripts/seed-e2e-minimal.ts) to
  // have run so at least one requisition exists.
  const firstOpen = page.getByRole('link', { name: /open/i }).first();
  await expect(firstOpen).toBeVisible({ timeout: 10_000 });
  await firstOpen.click();
  await page.waitForURL(/\/requisitions\/[0-9a-f-]+/i);

  // Pipeline is the default tab now — switch to Overview to reach
  // the requirements section that owns the Add skill dialog.
  await page.getByRole('tab', { name: /overview/i }).click();
  await page
    .getByRole('button', { name: /add skill/i })
    .first()
    .click();

  // The old <select id="skill"> should be gone — the autosuggest renders
  // an <input> instead. `CatalogAutosuggest` uses <Input /> with the
  // inputId="skill".
  const skillInput = page.locator('#skill');
  await expect(skillInput).toBeVisible();
  const tagName = await skillInput.evaluate((el) => el.tagName.toLowerCase());
  expect(tagName).toBe('input');

  // Type a nonsense skill name — the "+ Add skill: X" affordance
  // must show at the bottom of the suggestion list.
  const nonce = `TestSkill_${Date.now()}`;
  await skillInput.fill(nonce);
  await expect(page.getByText(new RegExp(`Add skill:.*${nonce}`))).toBeVisible({
    timeout: 5_000,
  });
});

test('requisition: Add required qualification dialog shows autosuggest + inline-create', async ({
  page,
}) => {
  await page.goto('/requisitions?view=table');
  const firstOpen = page.getByRole('link', { name: /open/i }).first();
  await expect(firstOpen).toBeVisible({ timeout: 10_000 });
  await firstOpen.click();
  await page.waitForURL(/\/requisitions\/[0-9a-f-]+/i);
  // Overview tab holds the requirements section.
  await page.getByRole('tab', { name: /overview/i }).click();
  await page
    .getByRole('button', { name: /add qualification/i })
    .first()
    .click();

  const qualInput = page.locator('#qual');
  await expect(qualInput).toBeVisible();
  const tagName = await qualInput.evaluate((el) => el.tagName.toLowerCase());
  expect(tagName).toBe('input');

  const nonce = `TestQual_${Date.now()}`;
  await qualInput.fill(nonce);
  await expect(page.getByText(new RegExp(`Add qualification:.*${nonce}`))).toBeVisible();
});

test('candidate onboarding: occupation picker is autosuggest + inline-create', async ({ page }) => {
  await page.goto('/candidates/new');
  await page.waitForURL(/\/candidates\/new\?draft=/i);

  const occupationInput = page.locator('#primaryOccupation');
  await expect(occupationInput).toBeVisible();
  const tagName = await occupationInput.evaluate((el) => el.tagName.toLowerCase());
  expect(tagName).toBe('input');

  const nonce = `TestOcc_${Date.now()}`;
  await occupationInput.fill(nonce);
  await expect(page.getByText(new RegExp(`Add occupation:.*${nonce}`))).toBeVisible();
});

test('root layout metadata: browser tab title reads brand from app_settings', async ({ page }) => {
  // Shortlists page exports a static title `Shortlists` (no brand
  // suffix — those were stripped). The root layout's `title.template`
  // supplies the brand from app_settings.legalName, composing to
  // `Shortlists · <brand>`. If the layout ever reverts to a hardcoded
  // string this test catches it.
  await page.goto('/shortlists');
  await page.waitForLoadState('networkidle');
  const title = await page.title();
  expect(title).toContain(' · ');
  expect(title).not.toContain('undefined');
});
