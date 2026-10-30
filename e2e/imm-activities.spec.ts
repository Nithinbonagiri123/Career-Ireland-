import { expect, type Page, test } from '@playwright/test';
import { e2eAdminId } from './helpers/owner';

/**
 * Stage 6G Activities (/tasks): filters, status tab, sort, page and view
 * live in the URL and survive a reload; every task action has an accessible
 * name naming its task; phones get cards with no sideways scroll. Seeds its
 * own unlinked tasks (unique stamp) and removes exactly those rows.
 */

const params = (page: Page) => new URL(page.url()).searchParams;

async function seedTasks() {
  const { config } = await import('dotenv');
  config({ path: '.env.local' });
  const { inArray } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const { tasks } = await import('../src/lib/db/schema/activities');
  const { auditEvents } = await import('../src/lib/db/schema/audit_events');
  const stamp = `act${Math.random().toString(36).slice(2, 7)}`;
  const owner = await e2eAdminId();
  const day = 24 * 60 * 60 * 1000;
  const rows = await db
    .insert(tasks)
    .values([
      {
        title: `Call sponsor ${stamp}`,
        description: 'Confirm the contract start date.',
        assignedUserId: owner,
        priority: 'HIGH',
        status: 'OPEN',
        dueAt: new Date(Date.now() + 2 * day),
      },
      {
        title: `Chase passport scan ${stamp}`,
        assignedUserId: owner,
        priority: 'URGENT',
        status: 'IN_PROGRESS',
        dueAt: new Date(Date.now() - day),
      },
      {
        title: `File permit copy ${stamp}`,
        assignedUserId: owner,
        priority: 'LOW',
        status: 'DONE',
        completedAt: new Date(),
      },
    ])
    .returning({ id: tasks.id, title: tasks.title });
  const ids = rows.map((r) => r.id);
  return {
    stamp,
    titles: rows.map((r) => r.title),
    cleanup: async () => {
      await db.delete(auditEvents).where(inArray(auditEvents.entityId, ids));
      await db.delete(tasks).where(inArray(tasks.id, ids));
    },
  };
}

test.describe('Activities (/tasks)', () => {
  test('filters, tab, sort and view are in the URL and survive a reload', async ({ page }) => {
    const seeded = await seedTasks();
    try {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(`/tasks?q=${seeded.stamp}`, { waitUntil: 'networkidle' });
      const filters = page.getByRole('region', { name: 'Filters' });
      await filters.getByRole('button', { name: /priority/i }).click();
      // The checkbox is visually replaced by a styled box; click its label.
      await page.locator('label', { hasText: /^High$/ }).click();
      await expect.poll(() => params(page).get('priority')).toBe('HIGH');
      await page.locator('label', { hasText: /^Urgent$/ }).click();
      await expect.poll(() => params(page).get('priority')).toBe('HIGH,URGENT');
      await page.keyboard.press('Escape');

      await page
        .getByRole('navigation', { name: 'Task status' })
        .getByRole('link', { name: /^Open/ })
        .click();
      await expect.poll(() => params(page).get('status')).toBe('OPEN');
      expect(params(page).get('priority')).toBe('HIGH,URGENT');

      await page.getByRole('combobox', { name: /sort by/i }).selectOption('due');
      await expect.poll(() => params(page).get('sort')).toBe('due');

      await page.getByRole('link', { name: /^cards$/i }).click();
      await expect.poll(() => params(page).get('view')).toBe('grid');

      await page.reload({ waitUntil: 'networkidle' });
      const p = params(page);
      expect([
        p.get('q'),
        p.get('priority'),
        p.get('status'),
        p.get('sort'),
        p.get('view'),
      ]).toEqual([seeded.stamp, 'HIGH,URGENT', 'OPEN', 'due', 'grid']);
      // Only the open, high-priority task matches.
      await expect(page.getByTestId('task-card')).toHaveCount(1);
      await expect(page.getByRole('heading', { name: seeded.titles[0] })).toBeVisible();
    } finally {
      await seeded.cleanup();
    }
  });

  test('every task action names its task', async ({ page }) => {
    const seeded = await seedTasks();
    try {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(`/tasks?q=${seeded.stamp}`, { waitUntil: 'networkidle' });
      const title = seeded.titles[0];
      for (const name of [
        `Start ‘${title}’`,
        `Mark ‘${title}’ done`,
        `Cancel ‘${title}’`,
        `More actions for ‘${title}’`,
      ]) {
        await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
      }
      // The title itself is a keyboard-reachable button that opens the editor.
      const titleButton = page.getByRole('button', { name: title, exact: true });
      await titleButton.focus();
      await expect(titleButton).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog')).toBeVisible();
    } finally {
      await seeded.cleanup();
    }
  });

  test('phones get cards and never scroll sideways', async ({ page }) => {
    const seeded = await seedTasks();
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/tasks?q=${seeded.stamp}`, { waitUntil: 'networkidle' });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        390,
      );
      await expect(page.getByTestId('task-card').first()).toBeVisible();
      await expect(page.locator('table')).toBeHidden();
      await expect(
        page.getByRole('button', { name: `Mark ‘${seeded.titles[0]}’ done`, exact: true }),
      ).toBeVisible();
    } finally {
      await seeded.cleanup();
    }
  });
});
