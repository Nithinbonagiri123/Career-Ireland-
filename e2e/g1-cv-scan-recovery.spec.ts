import { expect, test } from '@playwright/test';
import { e2eAdminId } from './helpers/owner';

/**
 * G1 — CV scan on Next.js 16.4: a scan whose request fails (aborted by
 * the network or a concurrent refresh) must never fail silently. The
 * Extracted CV panel shows a persistent error, the Scan button recovers,
 * and the next scan clears the error and completes.
 * No upload needed: the request is aborted in the browser.
 */

async function dbModules() {
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: '.env.local' });
  const { eq } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const persons = await import('../src/lib/db/schema/persons');
  return { db, eq, schemas: persons };
}

test('a failed CV scan is shown persistently and the next scan recovers', async ({ page }) => {
  const m = await dbModules();
  const stamp = Math.random().toString(36).slice(2, 7);
  const [person] = await m.db
    .insert(m.schemas.persons)
    .values({
      firstName: 'Scan',
      lastName: `Recovery-${stamp}`,
      email: `scan-recovery-${stamp}@example.test`,
      source: 'DIRECT',
    })
    .returning({ id: m.schemas.persons.id });
  if (!person) throw new Error('person seed failed');
  await m.db.insert(m.schemas.candidateProfiles).values({
    assignedUserId: await e2eAdminId(),
    personId: person.id,
    lifecycleStatus: 'ACTIVE',
    availabilityStatus: 'AVAILABLE',
  });
  try {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto(`/clients/${person.id}?tab=documents-candidate`);
    const scan = page.getByRole('button', { name: /^Scan CV$/ }).first();
    await expect(scan).toBeEnabled({ timeout: 20_000 });

    // Abort the scan's server-action request (POST carrying `next-action`).
    await page.route(`**/clients/${person.id}**`, async (route) => {
      const req = route.request();
      if (req.method() === 'POST' && req.headers()['next-action']) return route.abort('failed');
      return route.continue();
    });
    await scan.click();
    await expect(page.getByTestId('cv-scan-error')).toContainText(/did not complete/i, {
      timeout: 15_000,
    });
    await expect(scan).toBeEnabled();

    // Network back — the next scan runs, completes and clears the error.
    await page.unroute(`**/clients/${person.id}**`);
    await scan.click();
    await expect(page.getByText(/No CV on file for this candidate/).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId('cv-scan-error')).toHaveCount(0);
    await expect(scan).toBeEnabled();
  } finally {
    await m.db
      .delete(m.schemas.candidateProfiles)
      .where(m.eq(m.schemas.candidateProfiles.personId, person.id));
    await m.db.delete(m.schemas.persons).where(m.eq(m.schemas.persons.id, person.id));
  }
});
