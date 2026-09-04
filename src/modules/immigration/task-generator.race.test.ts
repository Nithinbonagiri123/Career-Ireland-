import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db/client';
import { tasks } from '@/lib/db/schema/activities';
import { immigrationCases } from '@/lib/db/schema/immigration';
import { persons } from '@/lib/db/schema/persons';
import { users } from '@/lib/db/schema/users';
import { generateCaseTasks } from './task-generator';

/**
 * Regression test for the reproduced immigration task-generator race.
 *
 * Original defect: two concurrent status transitions on the same case both
 * passed `insertIfMissing`'s SELECT-then-INSERT and inserted duplicate tasks.
 * Proven live on 2026-09-03 with 5 concurrent runs producing 3 copies of the
 * "Chase missing documents" task instead of 1.
 *
 * Fix: partial unique index `tasks_immigration_case_title_active_uidx` +
 * `.onConflictDoNothing()` in the insert path so the loser's INSERT returns
 * 0 rows instead of aborting the transaction.
 *
 * This test hits the real dev DB. Creates E2E-prefixed rows and deletes
 * them in afterAll. Requires the e2e-admin seed to exist (Playwright's
 * globalSetup, or `pnpm db:seed:admin`).
 */

const PREFIX = `VITEST_TASK_RACE_${Date.now()}`;

let adminUserId: string;
let personId: string;
let caseId: string;

beforeAll(async () => {
  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'e2e-admin@ireland-careers.test'))
    .limit(1);
  if (!admin) {
    throw new Error(
      'e2e-admin seed missing — run `node_modules/.bin/playwright test --project=admin` once first',
    );
  }
  adminUserId = admin.id;

  const [p] = await db
    .insert(persons)
    .values({
      firstName: `${PREFIX}_first`,
      lastName: `${PREFIX}_last`,
      email: `${PREFIX.toLowerCase()}@example.test`,
      source: 'DIRECT',
    })
    .returning();
  if (!p) throw new Error('person insert failed');
  personId = p.id;

  const [c] = await db
    .insert(immigrationCases)
    .values({
      caseType: 'VISA',
      beneficiaryPersonId: personId,
      status: 'OPEN',
      assignedUserId: adminUserId,
    })
    .returning();
  if (!c) throw new Error('case insert failed');
  caseId = c.id;
});

afterAll(async () => {
  if (caseId) {
    await db.delete(tasks).where(eq(tasks.immigrationCaseId, caseId));
    await db.delete(immigrationCases).where(eq(immigrationCases.id, caseId));
  }
  if (personId) {
    await db.delete(persons).where(eq(persons.id, personId));
  }
});

describe('immigration task-generator race (regression for CVE-like defect)', () => {
  it('5 concurrent generateCaseTasks calls on same case produce exactly one task per template', async () => {
    const trigger = 'DOCUMENTS_PENDING' as const;
    const runOne = () =>
      db.transaction(async (tx) => {
        return generateCaseTasks(tx, {
          caseId,
          trigger,
          actorUserId: adminUserId,
          caseAssignedUserId: adminUserId,
        });
      });

    // Use allSettled so that if the fix regresses and transactions abort,
    // we still get to see the DB state instead of the whole test aborting.
    const settled = await Promise.allSettled([runOne(), runOne(), runOne(), runOne(), runOne()]);

    const rejections = settled.filter((s) => s.status === 'rejected');
    expect(
      rejections,
      `no concurrent run should throw (would surface as an error toast to real users). Rejected reasons: ${rejections
        .map((r) => (r.status === 'rejected' ? String(r.reason) : ''))
        .join(' | ')}`,
    ).toHaveLength(0);

    // The trigger creates 2 templates: "Chase missing documents…" + "Prepare submission…"
    // Each must exist exactly once regardless of the race.
    const grouped = await db
      .select({ title: tasks.title, n: sql<number>`COUNT(*)::int` })
      .from(tasks)
      .where(eq(tasks.immigrationCaseId, caseId))
      .groupBy(tasks.title);

    expect(grouped).toHaveLength(2);
    for (const row of grouped) {
      expect(
        row.n,
        `expected exactly 1 task titled "${row.title}", got ${row.n} — race regressed`,
      ).toBe(1);
    }
  });

  it('running the same trigger a second time is a no-op (still exactly one per template)', async () => {
    // Idempotency check: the second call should see the existing tasks and skip.
    const trigger = 'DOCUMENTS_PENDING' as const;
    await db.transaction(async (tx) => {
      await generateCaseTasks(tx, {
        caseId,
        trigger,
        actorUserId: adminUserId,
        caseAssignedUserId: adminUserId,
      });
    });

    const grouped = await db
      .select({ title: tasks.title, n: sql<number>`COUNT(*)::int` })
      .from(tasks)
      .where(eq(tasks.immigrationCaseId, caseId))
      .groupBy(tasks.title);

    expect(grouped).toHaveLength(2);
    for (const row of grouped) expect(row.n).toBe(1);
  });
});
