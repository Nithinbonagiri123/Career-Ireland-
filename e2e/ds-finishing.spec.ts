import { expect, test } from '@playwright/test';
import { seedCampaign, seedCandidate } from './helpers/fixtures';

/**
 * Stage 6G finishing items:
 *  - Matching: secondary filters collapse behind "More filters" on phones,
 *    keep their URL values, and show how many are set.
 *  - Prospect detail: the primary action stays visible at every width; other
 *    actions move into the "More actions" menu on narrow screens and still
 *    open their dialogs from there.
 */

const params = (url: string) => new URL(url).searchParams;

test.describe('matching filters on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('secondary filters collapse, keep URL values and show a count', async ({ page }) => {
    await page.goto('/matching', { waitUntil: 'networkidle' });
    const filters = page.getByRole('region', { name: 'Filters' });
    const more = filters.getByRole('button', { name: /more filters/i });
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await expect(filters.getByRole('combobox', { name: 'Availability' })).toBeHidden();
    // Primary filters stay visible.
    await expect(filters.getByRole('combobox', { name: 'Job' })).toBeVisible();

    await more.click();
    await expect(filters.getByRole('button', { name: /fewer filters/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    const availability = filters.getByRole('combobox', { name: 'Availability' });
    await expect(availability).toBeVisible();
    await availability.selectOption('all');
    await expect.poll(() => params(page.url()).get('availability')).toBe('all');

    // After a reload the section is collapsed again but the count shows the
    // hidden filter is set, and the value survives.
    await page.reload({ waitUntil: 'networkidle' });
    await expect(filters.getByRole('button', { name: /more filters\s*1/i })).toBeVisible();
    await filters.getByRole('button', { name: /more filters/i }).click();
    await expect(filters.getByRole('combobox', { name: 'Availability' })).toHaveValue('all');
  });

  test('desktop shows every filter and no toggle', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/matching', { waitUntil: 'networkidle' });
    const filters = page.getByRole('region', { name: 'Filters' });
    await expect(filters.getByRole('combobox', { name: 'Availability' })).toBeVisible();
    await expect(filters.getByRole('button', { name: /more filters/i })).toBeHidden();
  });
});

async function seedProspect() {
  const { config } = await import('dotenv');
  config({ path: '.env.local' });
  const { eq, inArray } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const { advertisements, recruitmentProspects } = await import('../src/lib/db/schema/campaigns');
  const { auditEvents } = await import('../src/lib/db/schema/audit_events');
  const campaign = await seedCampaign();
  const person = await seedCandidate();
  const today = new Date().toISOString().slice(0, 10);
  const [ad] = await db
    .insert(advertisements)
    .values({
      campaignId: campaign.campaignId,
      country: 'Ireland',
      platform: 'IrishJobs',
      startDate: today,
      expiryDate: today,
      status: 'DRAFT',
    })
    .returning({ id: advertisements.id });
  if (!ad) throw new Error('advert seed failed');
  const [prospect] = await db
    .insert(recruitmentProspects)
    .values({ personId: person.personId, advertisementId: ad.id, status: 'SCREENED' })
    .returning({ id: recruitmentProspects.id });
  if (!prospect) throw new Error('prospect seed failed');
  return {
    prospectId: prospect.id,
    cleanup: async () => {
      await db.delete(auditEvents).where(inArray(auditEvents.entityId, [prospect.id, ad.id]));
      await db.delete(recruitmentProspects).where(eq(recruitmentProspects.id, prospect.id));
      await db.delete(advertisements).where(eq(advertisements.id, ad.id));
      await person.cleanup();
      await campaign.cleanup();
    },
  };
}

test.describe('prospect header actions', () => {
  test('phone: primary visible, others in More actions, dialogs open from the menu', async ({
    page,
  }) => {
    const seeded = await seedProspect();
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/prospects/${seeded.prospectId}`, { waitUntil: 'networkidle' });
      const actions = page.getByTestId('prospect-actions');
      await expect(actions.getByRole('button', { name: /convert to candidate/i })).toBeVisible();
      await expect(actions.getByRole('button', { name: /^note$/i })).toBeHidden();
      const more = actions.getByRole('button', { name: 'More actions' });
      await expect(more).toBeVisible();
      await more.click();
      await page.getByRole('menu').getByRole('button', { name: /note/i }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');

      await page.setViewportSize({ width: 1440, height: 900 });
      await expect(actions.getByRole('button', { name: /^note$/i })).toBeVisible();
      await expect(actions.getByRole('button', { name: 'More actions' })).toBeHidden();
      await expect(actions.getByRole('button', { name: /convert to candidate/i })).toBeVisible();
    } finally {
      await seeded.cleanup();
    }
  });
});
