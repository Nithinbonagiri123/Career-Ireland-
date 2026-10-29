import { expect, test } from '@playwright/test';

/**
 * R3 — a STAFF user (no recruitment.interviews grant) can read the
 * Interviews & Offers tab but is offered no write controls. The server
 * refuses the writes too (unit-tested in src/modules/offers/r3.test.ts).
 */

test('STAFF sees Interviews & Offers read-only', async ({ page }) => {
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: '.env.local' });
  const { eq } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const { employers, jobRequisitions } = await import('../src/lib/db/schema/recruitment');
  const stamp = Math.random().toString(36).slice(2, 7);
  const [emp] = await db
    .insert(employers)
    .values({ legalName: `R3 View ${stamp}` })
    .returning({ id: employers.id });
  if (!emp) throw new Error('seed failed');
  const [req] = await db
    .insert(jobRequisitions)
    .values({
      employerId: emp.id,
      title: `R3 View Job ${stamp}`,
      positionsRequired: 1,
      employmentType: 'FULL_TIME',
      status: 'OPEN',
    })
    .returning({ id: jobRequisitions.id });
  if (!req) throw new Error('seed failed');
  try {
    await page.goto(`/requisitions/${req.id}?tab=interviews`);
    const io = page.getByTestId('interviews-offers');
    await expect(io).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('io-read-only')).toBeVisible();
    await expect(io.getByRole('button', { name: /Schedule interview/ })).toHaveCount(0);
    await expect(io.getByRole('button', { name: /Create offer/ })).toHaveCount(0);
  } finally {
    await db.delete(jobRequisitions).where(eq(jobRequisitions.id, req.id));
    await db.delete(employers).where(eq(employers.id, emp.id));
  }
});
