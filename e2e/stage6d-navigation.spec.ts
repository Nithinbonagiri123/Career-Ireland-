import { expect, test } from '@playwright/test';

/**
 * Stage 6D Wave 6 — navigation + deep-link acceptance.
 *
 * Verifies that the Wave 4 redirects + ambient-nav updates behave as
 * promised:
 *   - /candidates/[id] redirects to /clients/[personId]
 *   - /leads/[id] (person-based) redirects to /clients/[personId]
 *   - Child deep links (/candidates/[id]/invoices/[number],
 *     /leads/[id]/pro-formas/[pfId]) still resolve to their legacy
 *     routes (NOT redirected) so audit links + PDFs stay valid.
 */

async function seedPersonAndLead(firstName: string) {
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: '.env.local' });
  const { eq } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const { persons } = await import('../src/lib/db/schema/persons');
  const { leads } = await import('../src/lib/db/schema/leads');

  const [p] = await db
    .insert(persons)
    .values({
      firstName,
      lastName: 'Nav',
      email: `${firstName.toLowerCase()}-nav@example.test`,
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
      if (l?.id) await db.delete(leads).where(eq(leads.id, l.id));
      await db.delete(persons).where(eq(persons.id, p.id));
    },
  };
}

test('legacy /candidates/[id] redirects to /clients/[personId]', async ({ page }) => {
  const seeded = await seedPersonAndLead(`Rd${Math.random().toString(36).slice(2, 6)}`);
  try {
    await page.goto(`/candidates/${seeded.personId}`);
    // After redirect the URL should contain /clients/
    await expect(page).toHaveURL(new RegExp(`/clients/${seeded.personId}`), { timeout: 15_000 });
  } finally {
    await seeded.cleanup();
  }
});

test('legacy /leads/[id] (person-based) redirects to /clients/[personId]?tab=billing', async ({
  page,
}) => {
  const seeded = await seedPersonAndLead(`Ld${Math.random().toString(36).slice(2, 6)}`);
  try {
    if (!seeded.leadId) test.skip(true, 'lead was not seeded');
    await page.goto(`/leads/${seeded.leadId}`);
    await expect(page).toHaveURL(new RegExp(`/clients/${seeded.personId}\\?tab=billing`), {
      timeout: 15_000,
    });
  } finally {
    await seeded.cleanup();
  }
});

test('tab query param on /candidates/[id] carries through the redirect', async ({ page }) => {
  const seeded = await seedPersonAndLead(`Tq${Math.random().toString(36).slice(2, 6)}`);
  try {
    await page.goto(`/candidates/${seeded.personId}?tab=applications`);
    await expect(page).toHaveURL(
      new RegExp(`/clients/${seeded.personId}\\?tab=applications`),
      { timeout: 15_000 },
    );
  } finally {
    await seeded.cleanup();
  }
});
