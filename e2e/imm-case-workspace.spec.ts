import { expect, type Page, test } from '@playwright/test';
import { seedImmigrationScenario } from './helpers/fixtures';

/**
 * Immigration case workspace (Stage 6G). Runs on an isolated, populated
 * scenario: header, Next step, URL-synced tabs, accessible row controls,
 * verified profile and billing destinations, and no sideways scroll.
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

const noSideScroll = async (page: Page, width: number) => {
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(sw, `page width at ${width}px`).toBeLessThanOrEqual(width);
};

test('case page: header, next step and billing render', async ({ page }) => {
  await page.goto(`/immigration/${seeded.cases.open}`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { level: 1 })).toContainText(seeded.names.open);
  await expect(page.getByRole('region', { name: 'Next step' })).toBeVisible();
  await expect(page.getByText('Billing for this case')).toBeVisible();
});

test('tabs: Overview, Documents and Tasks each show their content', async ({ page }) => {
  await page.goto(`/immigration/${seeded.cases.open}`, { waitUntil: 'networkidle' });
  const overview = page.getByRole('tab', { name: /^Overview/ });
  await expect(overview).toHaveAttribute('aria-selected', 'true');

  await page.getByRole('tab', { name: /^Documents/ }).click();
  await expect(page.getByText('Case documents')).toBeVisible();
  for (const name of seeded.requirementNames) {
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
  }

  await page.getByRole('tab', { name: /^Tasks/ }).click();
  await expect(page.getByText(seeded.taskTitles.open)).toBeVisible();
  await expect(page.getByText(seeded.taskTitles.done)).toBeVisible();
});

test('archive is reachable from More actions and asks for a reason', async ({ page }) => {
  await page.goto(`/immigration/${seeded.cases.open}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('button', { name: /^Archive case$/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(`Archive ${seeded.names.open}'s case?`);
  await expect(dialog.getByLabel(/reason/i)).toBeVisible();
  // Cancel — nothing is archived.
  await dialog.getByRole('button', { name: /^cancel$/i }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

for (const width of [1440, 820, 390]) {
  test(`no sideways page scroll at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/immigration/${seeded.cases.open}`, { waitUntil: 'networkidle' });
    await noSideScroll(page, width);
  });
}

test('?tab= deep links open Documents and Tasks; switching tabs updates the URL', async ({
  page,
}) => {
  await page.goto(`/immigration/${seeded.cases.open}?tab=documents`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('tab', { name: /^Documents/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByText('Case documents')).toBeVisible();

  await page.goto(`/immigration/${seeded.cases.open}?tab=tasks`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('tab', { name: /^Tasks/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText(seeded.taskTitles.open)).toBeVisible();

  await page.getByRole('tab', { name: /^Overview/ }).click();
  await expect(page).not.toHaveURL(/tab=/);
  await page.getByRole('tab', { name: /^Documents/ }).click();
  await expect(page).toHaveURL(/\?tab=documents$/);
});

test('Next step "Open documents" lands on the Documents tab', async ({ page }) => {
  await page.goto(`/immigration/${seeded.cases.open}`, { waitUntil: 'networkidle' });
  const banner = page.getByRole('region', { name: 'Next step' });
  const link = banner.getByRole('link', { name: /open documents/i });
  // Self-links ("Open case") are not rendered; this case is collecting documents.
  await expect(link).toHaveAttribute('href', `/immigration/${seeded.cases.open}?tab=documents`);
  await link.click();
  await expect(page.getByRole('tab', { name: /^Documents/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('profile links point at the client workspace', async ({ page }) => {
  await page.goto(`/immigration/${seeded.cases.open}?tab=documents`, { waitUntil: 'networkidle' });
  const profile = page.getByRole('link', { name: 'the candidate’s profile' }).first();
  await expect(profile).toHaveAttribute('href', /^\/clients\/[0-9a-f-]+\?tab=documents-candidate$/);
  const href = await profile.getAttribute('href');
  expect(seeded.personIds.some((id) => href?.includes(id))).toBe(true);
  // No unlabelled no-op buttons remain in the documents tab.
  await expect(page.getByRole('button', { name: 'the candidate’s profile' })).toHaveCount(0);

  await page.getByRole('tab', { name: /^Overview/ }).click();
  await expect(
    page.getByRole('link', { name: `Open candidate profile for ${seeded.names.open}` }),
  ).toHaveAttribute('href', /^\/clients\/[0-9a-f-]+$/);
  await expect(page.getByRole('link', { name: /^Open employer/ })).toHaveAttribute(
    'href',
    `/employers/${seeded.employerId}`,
  );
});

test('requirement and task controls have unique accessible names', async ({ page }) => {
  await page.goto(`/immigration/${seeded.cases.open}?tab=documents`, { waitUntil: 'networkidle' });
  for (const name of seeded.requirementNames) {
    await expect(page.getByRole('combobox', { name: `Status for ${name}` })).toHaveCount(1);
    await expect(page.getByRole('button', { name: `Remove requirement ${name}` })).toHaveCount(1);
  }
  await expect(page.getByRole('combobox', { name: 'Requirement status' })).toHaveCount(0);
  // Status options read as words, not raw enum values.
  const first = page.getByRole('combobox', { name: `Status for ${seeded.requirementNames[0]}` });
  await expect(first.locator('option')).toHaveText(['Missing', 'Provided', 'Accepted', 'Rejected']);

  await page.getByRole('tab', { name: /^Tasks/ }).click();
  const open = seeded.taskTitles.open;
  await expect(page.getByRole('button', { name: `Start ${open}` })).toHaveCount(1);
  await expect(page.getByRole('button', { name: `Done: ${open}` })).toHaveCount(1);
  await expect(page.getByRole('button', { name: `Cancel ${open}` })).toHaveCount(1);
  // The finished task offers no actions.
  await expect(page.getByRole('button', { name: new RegExp(seeded.taskTitles.done) })).toHaveCount(
    0,
  );
});

test('billing links go to the payer’s invoice / receipt pages', async ({ page }) => {
  // Pattern check on every billing Open link rendered on seeded cases (the
  // fixture raises no invoices; any linked rows must follow the payer route).
  for (const caseId of seeded.caseIds) {
    await page.goto(`/immigration/${caseId}`, { waitUntil: 'networkidle' });
    await expect(page.getByText('Billing for this case')).toBeVisible();
    const hrefs = await page
      .getByTestId('case-billing')
      .getByRole('link', { name: /^Open (invoice|receipt) / })
      .evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? ''));
    for (const href of hrefs) {
      expect(href).toMatch(/^\/(candidates|employers)\/[0-9a-f-]+\/(invoices|receipts)\/[^/]+$/);
      expect(href).not.toContain('/clients/');
    }
  }
});

test('billing href helper follows the recorded payer', async () => {
  const { caseBillingHref } = await import('../src/app/(app)/immigration/[id]/billing-links');
  expect(
    caseBillingHref('invoices', { number: 'INV-1', payerPersonId: 'p1', payerEmployerId: null }),
  ).toBe('/candidates/p1/invoices/INV-1');
  expect(
    caseBillingHref('receipts', { number: 'RCT-1', payerPersonId: null, payerEmployerId: 'e1' }),
  ).toBe('/employers/e1/receipts/RCT-1');
  expect(
    caseBillingHref('invoices', { number: 'INV-2', payerPersonId: null, payerEmployerId: null }),
  ).toBeNull();
});

test('closed and approved cases: banner and quick actions unchanged', async ({ page }) => {
  await page.goto(`/immigration/${seeded.cases.approved}`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { level: 1 })).toContainText(seeded.names.approved);
  await expect(page.getByTestId('case-progress')).toContainText('Phase 3 of 4');
  // "Open case" self-link is not rendered as a button.
  await expect(
    page.getByRole('region', { name: 'Next step' }).getByRole('link', { name: /open case/i }),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: /close case/i }).first()).toBeVisible();
});
