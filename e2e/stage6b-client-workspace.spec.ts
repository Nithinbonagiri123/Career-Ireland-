import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { e2eAdminId } from './helpers/owner';

/**
 * Stage 6B — unified Client Workspace smoke + screenshots.
 *
 * Seeds a complete lead → person path, opens the workspace, and asserts
 * the four tabs render. Produces desktop + mobile screenshots for the
 * design review.
 */

const SHOTS_DIR = path.resolve('playwright/stage6b-screenshots');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

async function seedPerson(firstName: string) {
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: '.env.local' });
  const { db } = await import('../src/lib/db/client');
  const { persons } = await import('../src/lib/db/schema/persons');
  const { leads } = await import('../src/lib/db/schema/leads');

  const [p] = await db
    .insert(persons)
    .values({
      firstName,
      lastName: 'Workspace',
      email: `${firstName.toLowerCase()}-ws@example.test`,
      phone: '+353871234999',
      currentCity: 'Dublin',
      currentCountry: 'Ireland',
      source: 'DIRECT',
    })
    .returning({ id: persons.id });
  if (!p) throw new Error('person insert failed');

  const [l] = await db
    .insert(leads)
    .values({
      assignedUserId: await e2eAdminId(),
      personId: p.id,
      targetBusiness: 'CANDIDATE_SERVICES',
      status: 'NEW',
    })
    .returning({ id: leads.id });

  return {
    personId: p.id,
    leadId: l?.id ?? null,
    cleanup: async () => {
      const { eq } = await import('drizzle-orm');
      if (l?.id) await db.delete(leads).where(eq(leads.id, l.id));
      await db.delete(persons).where(eq(persons.id, p.id));
    },
  };
}

test('inline quote composer opens from the workspace Billing tab', async ({ page }) => {
  const stamp = Math.random().toString(36).slice(2, 6);
  const seeded = await seedPerson(`S6B1C${stamp}`);
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/clients/${seeded.personId}?tab=billing`);
    // Billing tab shows the Quotes card with a "+ New quote" trigger.
    await expect(page.getByText(/No services on file yet/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await page
      .getByRole('button', { name: /\+ New quote/i })
      .first()
      .click();
    // The composer opens inline; the dialog title is "Create pro forma"
    // (reused from the existing lead-page composer).
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/create pro forma/i)).toBeVisible();
    await page.screenshot({
      path: path.join(SHOTS_DIR, 'desktop-inline-create-quote-dialog.png'),
      fullPage: true,
    });
    // Close the dialog — we don't need to actually submit to prove the
    // inline wiring.
    await page.keyboard.press('Escape');
  } finally {
    await seeded.cleanup();
  }
});

test('workspace renders for a fresh lead-stage client (desktop + mobile)', async ({ page }) => {
  const stamp = Math.random().toString(36).slice(2, 6);
  const seeded = await seedPerson(`S6B${stamp}`);
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/clients/${seeded.personId}`);

    // Header renders the name.
    await expect(page.getByRole('heading', { name: new RegExp(`S6B${stamp}`, 'i') })).toBeVisible({
      timeout: 15_000,
    });
    // Stage 6G — six tabs on the remodeled workspace.
    for (const label of [
      'Overview',
      'Profile',
      'Documents & CV',
      'Services & Billing',
      'Applications',
      'Activity',
    ]) {
      await expect(page.getByRole('tab', { name: label })).toBeVisible();
    }
    // Overview is the default tab and shows the Personal details card.
    await expect(page.getByText('Personal details').first()).toBeVisible();

    await page.screenshot({
      path: path.join(SHOTS_DIR, 'desktop-overview.png'),
      fullPage: true,
    });

    // Switch to Services & Billing — empty state, no quotes yet.
    await page.getByRole('tab', { name: 'Services & Billing' }).click();
    await expect(page.getByText(/No services on file yet/i).first()).toBeVisible();
    await page.screenshot({
      path: path.join(SHOTS_DIR, 'desktop-billing-empty.png'),
      fullPage: true,
    });

    // Activity tab — lead_created event is in the timeline.
    await page.getByRole('tab', { name: 'Activity' }).click();
    await expect(page.getByText(/enquiry opened/i)).toBeVisible();
    await page.screenshot({
      path: path.join(SHOTS_DIR, 'desktop-activity.png'),
      fullPage: true,
    });

    // Mobile viewport check.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/clients/${seeded.personId}`);
    await expect(page.getByRole('heading', { name: new RegExp(`S6B${stamp}`, 'i') })).toBeVisible();
    await page.screenshot({
      path: path.join(SHOTS_DIR, 'mobile-overview.png'),
      fullPage: true,
    });
  } finally {
    await seeded.cleanup();
  }
});
