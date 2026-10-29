import { expect, test } from '@playwright/test';

/**
 * R4 — a STAFF user without recruitment.campaigns / prospects write grants
 * is offered no campaign or prospect write controls. (Whether they can open
 * the pages at all depends on their view grants.) The server refuses the
 * writes regardless — unit-tested in src/modules/campaigns/r4.test.ts.
 */
test('STAFF gets no campaign or prospect write controls', async ({ page }) => {
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: '.env.local' });
  const { eq } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const { recruitmentCampaigns, advertisements } = await import('../src/lib/db/schema/campaigns');
  const stamp = Math.random().toString(36).slice(2, 7);
  const [c] = await db
    .insert(recruitmentCampaigns)
    .values({ name: `R4 Staff view ${stamp}`, status: 'ACTIVE', startedAt: new Date() })
    .returning({ id: recruitmentCampaigns.id });
  if (!c) throw new Error('seed failed');
  const [ad] = await db
    .insert(advertisements)
    .values({
      campaignId: c.id,
      country: 'Ireland',
      targetApplicants: 5,
      startDate: '2026-11-01',
      expiryDate: '2026-12-01',
      status: 'ACTIVE',
    })
    .returning({ id: advertisements.id });
  try {
    await page.goto(`/campaigns/${c.id}`);
    await page.waitForLoadState('networkidle');
    for (const name of [
      /^Activate$/,
      /^Complete$/,
      /^Edit$/,
      /Record prospect/,
      /Cancel campaign/,
      /^Archive$/,
    ]) {
      await expect(page.getByRole('button', { name })).toHaveCount(0);
    }
    await page.goto('/campaigns');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /New campaign/ })).toHaveCount(0);
  } finally {
    if (ad) await db.delete(advertisements).where(eq(advertisements.id, ad.id));
    await db.delete(recruitmentCampaigns).where(eq(recruitmentCampaigns.id, c.id));
  }
});
