import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const OUT = path.join(process.cwd(), 'screenshots');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

test('permissions editor: clean vs dirty save bar', async ({ page }) => {
  const { db } = await import('../src/lib/db/client');
  const { users } = await import('../src/lib/db/schema/users');
  const staff = await db.select({ id: users.id, isOwner: users.isOwner }).from(users).limit(50);
  const target = staff.find((u) => !u.isOwner);
  test.skip(!target, 'no non-owner user in DB');
  if (!target) return;

  await page.goto(`/admin/users/${target.id}/permissions`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 900 });

  // Clean state: page just loaded, no changes yet.
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(OUT, 'polish__savebar-clean.png'),
    fullPage: true,
  });

  // Dirty state: toggle any checkbox to trigger the save bar.
  const firstCheckbox = page.getByRole('checkbox').first();
  await firstCheckbox.click();
  await page.waitForTimeout(400); // let AnimatePresence + layout finish
  await page.screenshot({
    path: path.join(OUT, 'polish__savebar-dirty.png'),
    fullPage: true,
  });

  // Revert so we don't leave the DB in a modified state (click again).
  await firstCheckbox.click();
  await page.waitForTimeout(400);
});
