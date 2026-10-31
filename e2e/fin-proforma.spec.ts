import { expect, type Page, test } from '@playwright/test';
import { type FinanceScenario, seedFinanceScenario } from './helpers/finance-fixtures';

/**
 * F3 — Stage 6G pro-forma screens at phone / tablet / desktop:
 *  - detail page: header, document total and payment statuses on screen
 *    with no sideways scroll; one main landmark; named actions column;
 *  - print view: no sideways scroll, one main landmark (the document is an
 *    <article>);
 *  - create pro forma: no sideways scroll, services as a list, "pro forma"
 *    wording;
 *  - composer: every field has a label, remove buttons are named, and a
 *    validation error is shown inline. Nothing is saved.
 * Uses existing dev pro formas read-only (via the Finance fixture).
 */

const WIDTHS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 820, height: 1000 },
  { name: 'desktop', width: 1440, height: 1000 },
] as const;

let s: FinanceScenario;

test.beforeAll(async () => {
  s = await seedFinanceScenario();
});

test.afterAll(async () => {
  await s?.cleanup();
  const left = await s?.remaining();
  if (left)
    expect(
      Object.values(left).every((n) => n === 0),
      JSON.stringify(left),
    ).toBe(true);
});

async function sidewaysOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const main = document.querySelector('main') as HTMLElement | null;
    return main ? main.scrollWidth - main.clientWidth : -1;
  });
}

async function withinViewport(page: Page, locator: ReturnType<Page['locator']>) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('element has no box');
  const vw = page.viewportSize()?.width ?? 0;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vw + 1);
}

for (const w of WIDTHS) {
  test(`pro-forma detail fits and shows total + statuses — ${w.name}`, async ({ page }) => {
    const url = s.urls.proForma;
    test.skip(!url, 'no pro forma with payments in this database');
    await page.setViewportSize({ width: w.width, height: w.height });
    await page.goto(url ?? '', { waitUntil: 'networkidle' });

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Pro forma');
    await expect(page.getByRole('main')).toHaveCount(1);
    expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);

    // Document total label + amount are visible inside the viewport.
    const total = page.getByText('Document total', { exact: true }).locator('visible=true').first();
    await expect(total).toBeVisible();
    await withinViewport(page, total);

    // Payments: a visible summary and every visible status pill on screen.
    const summary = page.getByRole('definition').filter({ hasText: /€|\$|£/ });
    await expect(page.getByLabel('Payment summary')).toBeVisible();
    expect(await summary.count()).toBeGreaterThan(0);
    const list =
      w.width < 768
        ? page.getByRole('list', { name: 'Payments on this pro forma' })
        : page.getByRole('region', { name: 'Payments on this pro forma' });
    await expect(list).toBeVisible();
    const pills = list.locator('span.uppercase');
    const n = await pills.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      await expect(pills.nth(i)).toBeVisible();
      await withinViewport(page, pills.nth(i));
      // Readable label, never a raw enum code.
      expect(await pills.nth(i).textContent()).not.toMatch(/_/);
    }
    if (w.width >= 768) {
      await expect(list.getByRole('columnheader', { name: 'Actions' })).toHaveCount(1);
    }
    // The header status pill is readable too.
    const headerPill = page.locator('header span.uppercase').first();
    expect(await headerPill.textContent()).not.toMatch(/_/);
  });

  test(`pro-forma print view fits — ${w.name}`, async ({ page }) => {
    const url = s.urls.proFormaPrint;
    test.skip(!url, 'no pro forma in this database');
    await page.setViewportSize({ width: w.width, height: w.height });
    await page.goto(url ?? '', { waitUntil: 'networkidle' });
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.getByRole('article', { name: /^Pro forma PROF-/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to pro forma' })).toBeVisible();
    expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
  });

  test(`create pro forma fits and reads "pro forma" — ${w.name}`, async ({ page }) => {
    const url = s.urls.createProForma;
    test.skip(!url, 'no pro forma payer in this database');
    await page.setViewportSize({ width: w.width, height: w.height });
    await page.goto(url ?? '', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Create pro forma' })).toBeVisible();
    expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
    const leadMissing = await page.getByText(/no open Candidate Services lead/).count();
    if (leadMissing) return;
    await expect(page.getByRole('heading', { name: 'Pro forma details' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pro forma summary' })).toBeVisible();
    await expect(page.getByText('Invoice Details')).toHaveCount(0);
    await expect(page.getByLabel('Pro forma date')).toBeVisible();
    await expect(page.getByLabel('Payment terms')).toBeVisible();
    const services = page.getByRole('list', { name: 'Services on this pro forma' });
    await expect(services).toBeVisible();
    const firstRow = services.getByRole('listitem').first();
    await withinViewport(page, firstRow.getByRole('checkbox'));
    await withinViewport(page, firstRow.getByRole('button', { name: /^Remove / }));
  });
}

test('composer: labelled fields, named remove button, inline error (nothing saved)', async ({
  page,
}) => {
  const pfUrl = s.urls.proForma;
  test.skip(!pfUrl, 'no pro forma in this database');
  const leadUrl = (pfUrl ?? '').split('/pro-formas/')[0];
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(leadUrl, { waitUntil: 'networkidle' });
  const trigger = page.getByRole('button', { name: '+ New quote' }).first();
  test.skip((await trigger.count()) === 0, 'lead page offers no new quote here');
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Create pro forma' })).toBeVisible();

  await expect(dialog.getByRole('group', { name: 'Line items' })).toBeVisible();
  await expect(dialog.getByLabel('Service (line 1)')).toBeVisible();
  await expect(dialog.getByLabel('Qty (line 1)')).toBeVisible();
  await expect(dialog.getByLabel('Unit price (line 1)')).toBeVisible();
  const desc = dialog.getByLabel(/^Description.*\(line 1\)$/);
  await expect(desc).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Remove line 1' })).toBeVisible();

  await dialog.getByRole('button', { name: /^Add line$/ }).click();
  await expect(dialog.getByLabel('Qty (line 2)')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Remove line 2' })).toBeEnabled();

  // Inline error — the server is never called because validation fails.
  await desc.fill('');
  await dialog.getByRole('button', { name: 'Save draft' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Every line needs a description');

  // No sideways scroll inside the dialog on a phone.
  const overflow = await dialog.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
