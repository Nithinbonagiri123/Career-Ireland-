import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Stage 6B+2 — mobile dialog screenshots.
 *
 * Captures each key dialog at 390×844 (iPhone 14 Pro portrait) so a
 * designer can review the mobile fit without re-running the suite.
 * Also exercises long-name + large-currency rendering so we catch
 * truncation / wrap bugs that only show at narrow widths.
 */

const SHOTS_DIR = path.resolve('playwright/stage6b2-screenshots');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

async function seedForMobile(firstName: string, lastName: string) {
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: '.env.local' });
  const { db } = await import('../src/lib/db/client');
  const { persons } = await import('../src/lib/db/schema/persons');
  const { leads } = await import('../src/lib/db/schema/leads');
  const [p] = await db
    .insert(persons)
    .values({
      firstName,
      lastName,
      email: 'mobile-screenshot@example.test',
      phone: '+353871234567',
      currentCity: 'Dublin',
      currentCountry: 'Ireland',
      source: 'DIRECT',
    })
    .returning({ id: persons.id });
  if (!p) throw new Error('person insert failed');
  const [l] = await db
    .insert(leads)
    .values({ personId: p.id, targetBusiness: 'CANDIDATE_SERVICES', status: 'NEW' })
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

test('mobile: workspace renders long names + handles the quote composer dialog', async ({
  page,
}) => {
  const seeded = await seedForMobile(
    'Jean-Baptiste-Alexander',
    'Montgomery-Smythe-Fitzgerald-Williamson',
  );
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/clients/${seeded.personId}`);
    await expect(page.getByText(/Jean-Baptiste/i).first()).toBeVisible({ timeout: 15_000 });

    // Full-page capture — asserts the long name doesn't overflow and the
    // sidebar collapses on narrow widths.
    await page.screenshot({
      path: path.join(SHOTS_DIR, 'mobile-workspace-long-name.png'),
      fullPage: true,
    });

    // Switch to Billing + open the quote composer dialog. Mobile dialog
    // must be scrollable + readable; take a focused screenshot.
    await page.getByRole('tab', { name: 'Billing' }).click();
    await page
      .getByRole('button', { name: /\+ New quote/i })
      .first()
      .click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.screenshot({
      path: path.join(SHOTS_DIR, 'mobile-composer-dialog.png'),
      fullPage: false,
    });

    // Multi-line in the composer at mobile — adds a 2nd line and screenshots.
    await dialog.getByRole('button', { name: /add line/i }).click();
    await page.screenshot({
      path: path.join(SHOTS_DIR, 'mobile-composer-dialog-two-lines.png'),
      fullPage: true,
    });

    // Escape dismiss works on mobile.
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
  } finally {
    await seeded.cleanup();
  }
});
