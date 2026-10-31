import { expect, type Locator, type Page, test } from '@playwright/test';
import { seedCampaign, seedOpenJob } from './helpers/fixtures';

/**
 * Recruitment P0 — forms (W3). Business scenario:
 *
 * An HR manager sets up a new client's contacts. She adds the HR director
 * as primary contact, then immediately adds the operations manager:
 *   - the second Add contact form opens blank (it used to open prefilled
 *     with the first contact, primary ticked);
 *   - ticking Primary says "This replaces <first> as primary contact";
 *   - the toast and the Activity tab name the swap;
 *   - Cancel never brings typed values back, and the first contact's Edit
 *     dialog shows she is no longer primary (it used to be stale).
 * She then adds a new employer from the list; reopening New employer is
 * blank and does not warn that it duplicates itself.
 * On employer, job and campaign workspaces the selected tab is visibly
 * marked (navy underline + heavier text), which base-ui's attribute rename
 * had silently switched off.
 */

async function dbModules() {
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: '.env.local' });
  const { eq, inArray, sql } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const recruitment = await import('../src/lib/db/schema/recruitment');
  return { db, eq, inArray, sql, s: recruitment };
}

/** The selected tab: aria-selected, semibold, and a visible ::after underline. */
async function expectMarkedTab(tab: Locator) {
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  const style = await tab.evaluate((el) => {
    const after = getComputedStyle(el, '::after');
    return {
      weight: Number(getComputedStyle(el).fontWeight),
      underline: after.backgroundColor,
      height: after.height,
    };
  });
  expect(style.weight).toBeGreaterThanOrEqual(600);
  expect(style.underline).not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  expect(style.height).toBe('2px');
}

async function expectUnmarkedTab(tab: Locator) {
  await expect(tab).toHaveAttribute('aria-selected', 'false');
  const underline = await tab.evaluate((el) => getComputedStyle(el, '::after').backgroundColor);
  expect(underline).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
}

async function openAddContact(page: Page) {
  await page.getByRole('button', { name: 'Add contact' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add contact' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function expectBlankContactForm(dialog: Locator) {
  await expect(dialog.getByLabel('Full name')).toHaveValue('');
  await expect(dialog.getByLabel('Job title')).toHaveValue('');
  await expect(dialog.getByLabel('Email')).toHaveValue('');
  await expect(dialog.getByLabel('Phone')).toHaveValue('');
  await expect(dialog.getByRole('checkbox', { name: /Primary contact/ })).not.toBeChecked();
}

test('HR manager adds two employer contacts back-to-back; primary swap is named everywhere', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const job = await seedOpenJob();
  const tag = job.title.split(' ').pop();
  const alice = `Alice Primary ${tag}`;
  const bob = `Bob Smith ${tag}`;
  const m = await dbModules();
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/employers/${job.employerId}?tab=contacts`);
    await expect(page.getByRole('tab', { name: 'Contacts' })).toBeVisible({ timeout: 30_000 });
    await expectMarkedTab(page.getByRole('tab', { name: 'Contacts' }));
    await expectUnmarkedTab(page.getByRole('tab', { name: 'Overview' }));

    // 1. First contact: the HR director, primary.
    let dialog = await openAddContact(page);
    await expectBlankContactForm(dialog);
    await dialog.getByLabel('Full name').fill(alice);
    await dialog.getByLabel('Job title').fill('HR Director');
    await dialog.getByLabel('Email').fill(`alice.${tag}@acme.example`);
    await dialog.getByLabel('Phone').fill('+353 1 555 0101');
    await dialog.getByRole('checkbox', { name: /Primary contact/ }).check();
    // No primary yet, so nothing is replaced.
    await expect(dialog.getByTestId('primary-replaces-note')).toHaveText('');
    await dialog.getByRole('button', { name: 'Add contact' }).click();
    await expect(page.getByText(`${alice} added as primary contact`)).toBeVisible({
      timeout: 15_000,
    });
    await expect(dialog).toBeHidden();
    await expect(page.getByText(alice).first()).toBeVisible({ timeout: 15_000 });

    // 2. Straight away, the second contact: the form is blank.
    dialog = await openAddContact(page);
    await expectBlankContactForm(dialog);
    await dialog.getByLabel('Full name').fill(bob);
    await dialog.getByLabel('Job title').fill('Operations Manager');
    await dialog.getByRole('checkbox', { name: /Primary contact/ }).check();
    await expect(dialog.getByTestId('primary-replaces-note')).toHaveText(
      `This replaces ${alice} as primary contact.`,
    );
    // Unticking withdraws the warning.
    await dialog.getByRole('checkbox', { name: /Primary contact/ }).uncheck();
    await expect(dialog.getByTestId('primary-replaces-note')).toHaveText('');
    await dialog.getByRole('checkbox', { name: /Primary contact/ }).check();
    await dialog.getByRole('button', { name: 'Add contact' }).click();
    await expect(
      page.getByText(`${bob} added as primary contact (replaced ${alice})`).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(dialog).toBeHidden();

    // 3. Cancel never brings typed values back.
    dialog = await openAddContact(page);
    await expectBlankContactForm(dialog);
    await dialog.getByLabel('Full name').fill('Typed then cancelled');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    dialog = await openAddContact(page);
    await expectBlankContactForm(dialog);
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    // 4. Alice's Edit dialog shows the current record: no longer primary.
    await expect(
      page.locator('li', { hasText: bob }).getByText('Primary', { exact: true }),
    ).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('button', { name: `Edit ${alice}` }).click();
    const edit = page.getByRole('dialog', { name: 'Edit contact' });
    await expect(edit.getByLabel('Full name')).toHaveValue(alice);
    await expect(edit.getByLabel('Job title')).toHaveValue('HR Director');
    await expect(edit.getByRole('checkbox', { name: /Primary contact/ })).not.toBeChecked();
    // Ticking it back would replace Bob — and says so.
    await edit.getByRole('checkbox', { name: /Primary contact/ }).check();
    await expect(edit.getByTestId('primary-replaces-note')).toHaveText(
      `This replaces ${bob} as primary contact.`,
    );
    await edit.getByRole('button', { name: 'Cancel' }).click();

    // 5. Bob was saved with his own details, not Alice's leftovers.
    const rows = await m.db
      .select()
      .from(m.s.employerContacts)
      .where(m.eq(m.s.employerContacts.employerId, job.employerId));
    const bobRow = rows.find((r) => r.fullName === bob);
    expect(bobRow).toMatchObject({ isPrimary: true, jobTitle: 'Operations Manager', phone: null });
    expect(rows.find((r) => r.fullName === alice)?.isPrimary).toBe(false);

    // 6. Activity names the swap; the Activity tab is the marked one.
    await page.getByRole('tab', { name: 'Activity' }).click();
    await expect(page).toHaveURL(/tab=activity/);
    await expectMarkedTab(page.getByRole('tab', { name: 'Activity' }));
    await expectUnmarkedTab(page.getByRole('tab', { name: 'Contacts' }));
    const panel = page.getByRole('tabpanel');
    await expect(
      panel.getByText(`${bob} added as primary contact (replaced ${alice})`),
    ).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      panel.getByText(`${alice} is no longer the primary contact (replaced by ${bob})`),
    ).toBeVisible();

    // Phone width: the marked tab still carries the underline.
    await page.setViewportSize({ width: 390, height: 844 });
    await expectMarkedTab(page.getByRole('tab', { name: 'Activity' }));
  } finally {
    await m.db.execute(
      m.sql`DELETE FROM audit_events WHERE entity_type = 'employer_contact' AND (context ->> 'employerId' = ${job.employerId} OR before ->> 'employerId' = ${job.employerId})`,
    );
    await m.db
      .delete(m.s.employerContacts)
      .where(m.eq(m.s.employerContacts.employerId, job.employerId));
    await job.cleanup();
  }
});

test('New employer opens blank again after creating one', async ({ page }) => {
  test.setTimeout(120_000);
  const tag = Math.random().toString(36).slice(2, 7);
  const name = `RecP0 Forms Employer ${tag}`;
  const m = await dbModules();
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    // Wait for hydration so the first click opens the dialog (cold dev compile).
    await page.goto('/employers', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'New employer' }).click();
    let dialog = page.getByRole('dialog', { name: 'Add employer' });
    await expect(dialog.getByLabel('Legal name')).toHaveValue('');
    await dialog.getByLabel('Legal name').fill(name);
    await dialog.getByLabel('Industry').fill('Nursing homes');
    await dialog
      .getByRole('button', { name: /Add employer|Create|Save/ })
      .last()
      .click();
    await expect(page.getByText('Employer added')).toBeVisible({ timeout: 15_000 });
    await expect(dialog).toBeHidden();

    await page.getByRole('button', { name: 'New employer' }).click();
    dialog = page.getByRole('dialog', { name: 'Add employer' });
    await expect(dialog.getByLabel('Legal name')).toHaveValue('');
    await expect(dialog.getByLabel('Industry')).toHaveValue('');
    // No duplicate warning about the employer just created.
    await expect(dialog.getByText(name)).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
  } finally {
    const rows = await m.db
      .select({ id: m.s.employers.id })
      .from(m.s.employers)
      .where(m.eq(m.s.employers.legalName, name));
    for (const r of rows) {
      await m.db.execute(m.sql`DELETE FROM audit_events WHERE entity_id = ${r.id}`);
      await m.db.delete(m.s.employers).where(m.eq(m.s.employers.id, r.id));
    }
  }
});

test('job and campaign workspaces mark the selected tab', async ({ page }) => {
  test.setTimeout(120_000);
  const job = await seedOpenJob();
  const camp = await seedCampaign();
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/requisitions/${job.jobId}?tab=activity`);
    const jobActivity = page.getByRole('tab', { name: /^Activity/ });
    await expect(jobActivity).toBeVisible({ timeout: 30_000 });
    await expectMarkedTab(jobActivity);
    await expectUnmarkedTab(page.getByRole('tab', { name: /^Overview/ }));

    await page.goto(`/campaigns/${camp.campaignId}`);
    const selected = page.locator('[role="tab"][aria-selected="true"]');
    await expect(selected).toHaveCount(1, { timeout: 30_000 });
    await expectMarkedTab(selected);
    const otherName = (
      await page.locator('[role="tab"][aria-selected="false"]').first().innerText()
    ).trim();
    const other = page.getByRole('tab', { name: otherName, exact: true });
    await other.click();
    await expectMarkedTab(other);
  } finally {
    await job.cleanup();
    await camp.cleanup();
  }
});
