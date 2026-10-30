import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { e2eAdminId } from './helpers/owner';

/**
 * Stage 6F (urgent) Phase 6 — before/after visual acceptance.
 *
 * Captures the surfaces the product owner explicitly asked for:
 *   - Leads page
 *   - New Lead dialog (widened to max-w-4xl, 3-col identity row)
 *   - Pro-forma composer (widened to max-w-3xl, scrollable)
 *
 * The fully-paid Candidate Overview + Client Billing screenshots live
 * in `stage6f-urgent-acceptance.spec.ts` scenario H.
 */

const SHOTS_DIR = path.resolve('playwright/stage6f-urgent');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

test('visual: Leads page + New Lead dialog + Pro-forma composer', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });

  // Leads page as the operator sees it. assigned=all so the view
  // doesn't collapse to just-me and shows seeded data from other
  // specs.
  await page.goto('/leads?assigned=all');
  await expect(page.getByRole('heading', { name: /Leads/i }).first()).toBeVisible({
    timeout: 15_000,
  });
  await page.screenshot({
    path: path.join(SHOTS_DIR, 'leads-page.png'),
    fullPage: true,
  });

  // New Lead dialog — widened + grouped. The identity row is now 3
  // columns (first / middle / last) instead of the old 2 + wrap.
  await page
    .getByRole('button', { name: /New lead/i })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  // Give the Framer-Motion dialog entrance a beat to settle so the
  // screenshot captures the final size.
  await page.waitForTimeout(400);
  await page.screenshot({
    path: path.join(SHOTS_DIR, 'new-lead-dialog.png'),
    fullPage: true,
  });
  await dialog
    .getByRole('button', { name: /Cancel/i })
    .first()
    .click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });

  // Pro-forma composer — reach it by seeding a lead and visiting its
  // detail page, then clicking "+ New quote". The widened composer
  // gives multi-line service rows room.
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: '.env.local' });
  const { eq } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const { persons } = await import('../src/lib/db/schema/persons');
  const { leads } = await import('../src/lib/db/schema/leads');
  const stamp = Math.random().toString(36).slice(2, 6);
  const [p] = await db
    .insert(persons)
    .values({
      firstName: 'ProForma',
      lastName: `Shot-${stamp}`,
      email: `pfshot-${stamp}@example.test`,
      source: 'DIRECT',
    })
    .returning({ id: persons.id });
  if (!p) throw new Error('seed person failed');
  const [l] = await db
    .insert(leads)
    .values({
      assignedUserId: await e2eAdminId(),
      personId: p.id,
      targetBusiness: 'CANDIDATE_SERVICES',
      status: 'NEW',
    })
    .returning({ id: leads.id });
  if (!l) throw new Error('seed lead failed');
  try {
    await page.goto(`/leads/${l.id}`);
    await expect(page.getByRole('heading', { name: /ProForma Shot-/i })).toBeVisible({
      timeout: 15_000,
    });
    // Click "+ New quote" if present (otherwise skip the composer).
    const newQuote = page.getByRole('button', { name: /New quote/i }).first();
    if (await newQuote.isVisible().catch(() => false)) {
      await newQuote.click();
      const composer = page.getByRole('dialog');
      await expect(composer).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(400);
      await page.screenshot({
        path: path.join(SHOTS_DIR, 'pro-forma-composer.png'),
        fullPage: true,
      });
    }
  } finally {
    await db.delete(leads).where(eq(leads.id, l.id));
    await db.delete(persons).where(eq(persons.id, p.id));
  }
});
