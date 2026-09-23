import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { eq } from 'drizzle-orm';

/**
 * Ad-hoc QA sweep — captures the states the standard visual-qa spec
 * can't cover:
 *   - Admin hub page
 *   - Permissions editor for the owner (read-only warning banner)
 *   - Permissions editor for a non-owner staff user (interactive)
 *   - Revenue section: default (MTD), 30-day preset, empty range
 *   - HR Today card in the Working state (after Clock in)
 *
 * Run with:
 *   pnpm exec playwright test qa-supplement.spec.ts --project=admin
 */

const OUT_DIR = path.join(process.cwd(), 'screenshots');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function shoot(page: import('@playwright/test').Page, filename: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT_DIR, `${filename}.png`), fullPage: true });
}

test('admin hub', async ({ page }) => {
  await page.goto('/admin', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await shoot(page, 'supp__admin-hub');
});

test('permissions editor: owner (read-only)', async ({ page }) => {
  const { db } = await import('../src/lib/db/client');
  const { users } = await import('../src/lib/db/schema/users');
  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.isOwner, true))
    .limit(1);
  test.skip(!owner, 'no owner in DB');
  if (!owner) return;
  await page.goto(`/admin/users/${owner.id}/permissions`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await shoot(page, 'supp__permissions-owner');
});

test('permissions editor: non-owner staff', async ({ page }) => {
  const { db } = await import('../src/lib/db/client');
  const { users } = await import('../src/lib/db/schema/users');
  const staff = await db
    .select({ id: users.id, email: users.email, role: users.role, isOwner: users.isOwner })
    .from(users)
    .limit(50);
  const target = staff.find(
    (u) => !u.isOwner && (u.role === 'STAFF' || u.role === 'ADMIN' || u.role === 'RECRUITER'),
  );
  test.skip(!target, 'no non-owner staff user in DB');
  if (!target) return;
  await page.goto(`/admin/users/${target.id}/permissions`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await shoot(page, 'supp__permissions-staff');
});

test('revenue: MTD default', async ({ page }) => {
  await page.goto('/dashboard', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const revenue = page.locator('[data-testid="revenue-section"]');
  await expect(revenue).toBeVisible();
  await revenue.scrollIntoViewIfNeeded().catch(() => {});
  await shoot(page, 'supp__revenue-mtd');
});

test('revenue: 30-day preset', async ({ page }) => {
  await page.goto('/dashboard?created=30d', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const revenue = page.locator('[data-testid="revenue-section"]');
  await expect(revenue).toBeVisible();
  await revenue.scrollIntoViewIfNeeded().catch(() => {});
  await shoot(page, 'supp__revenue-30d');
});

test('revenue: empty range', async ({ page }) => {
  // Far-future window guarantees no verified payments — triggers the empty state.
  await page.goto('/dashboard?from=2099-01-01&to=2099-12-31', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // Use .first() to hold a stable reference — otherwise a FadeUp
  // re-render between locate and scroll can detach the element and
  // fail with "Element is not attached to the DOM".
  const region = page.locator('[data-testid="revenue-section"]');
  await expect(region).toBeVisible();
  await region.scrollIntoViewIfNeeded().catch(() => {});
  await shoot(page, 'supp__revenue-empty');
});

test('hr: Today card in Working state', async ({ page }) => {
  await page.goto('/hr', { waitUntil: 'networkidle' });

  // Reset to a clean Off state first, whatever the DB has.
  const endBreak = page.getByRole('button', { name: /^end break$/i });
  if (await endBreak.isVisible().catch(() => false)) {
    await endBreak.click();
    await page.waitForTimeout(500);
  }
  const clockOut = page.getByRole('button', { name: /^clock out$/i });
  if (await clockOut.isVisible().catch(() => false)) {
    await clockOut.click();
    await page.waitForTimeout(500);
  }

  // Now clock in and screenshot the Working state.
  await page.getByRole('button', { name: /^clock in$/i }).click();
  await expect(page.getByText(/^working$/i)).toBeVisible({ timeout: 10_000 });
  await shoot(page, 'supp__hr-working');

  // Also capture the On-break state.
  await page.getByRole('button', { name: /^start break$/i }).click();
  await expect(page.getByText(/^on break$/i)).toBeVisible({ timeout: 10_000 });
  await shoot(page, 'supp__hr-on-break');

  // Clean up so subsequent tests don't inherit a live session.
  await page.getByRole('button', { name: /^end break$/i }).click();
  await expect(page.getByText(/^working$/i)).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /^clock out$/i }).click();
});
