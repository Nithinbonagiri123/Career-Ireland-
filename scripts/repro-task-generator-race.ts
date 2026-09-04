/**
 * Reproduction script for the documented immigration task-generator race.
 *
 * Two concurrent `generateCaseTasks` calls with the same `caseId` and trigger:
 *   T1  SELECT id FROM tasks WHERE case=X AND title=Y AND status IN(OPEN)  → empty
 *   T2  SELECT id FROM tasks WHERE case=X AND title=Y AND status IN(OPEN)  → empty
 *   T1  INSERT
 *   T2  INSERT           ← duplicate row, no DB constraint to reject it
 *
 * We prove the race by counting tasks after the concurrent fire. Expected
 * behaviour (post-fix): task count == 1 per template.
 *
 * SAFETY: creates only records prefixed `E2E_TASK_RACE_` on the dev DB, then
 * deletes them on exit. Never run this against production.
 *
 * Run:   pnpm tsx scripts/repro-task-generator-race.ts
 */

import { config } from 'dotenv';

// Load env BEFORE any @/ import that transitively loads src/lib/env.ts.
config({ path: '.env.local' });

async function main() {
  const { eq, sql } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const { tasks } = await import('../src/lib/db/schema/activities');
  const { immigrationCases } = await import('../src/lib/db/schema/immigration');
  const { persons } = await import('../src/lib/db/schema/persons');
  const { users } = await import('../src/lib/db/schema/users');
  const { generateCaseTasks } = await import('../src/modules/immigration/task-generator');

  const dbUrl = process.env.DATABASE_URL ?? '';
  if (/prod|production/i.test(dbUrl)) {
    console.error('DATABASE_URL looks like production — aborting.');
    process.exit(1);
  }
  console.log(`▸ Using DB host: ${new URL(dbUrl).hostname}`);

  const PREFIX = `E2E_TASK_RACE_${Date.now()}`;
  console.log(`▸ Prefix: ${PREFIX}`);

  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'e2e-admin@ireland-careers.test'))
    .limit(1);
  if (!admin) throw new Error('e2e admin not seeded — run pnpm playwright test once first');

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

  const [c] = await db
    .insert(immigrationCases)
    .values({
      caseType: 'VISA',
      beneficiaryPersonId: p.id,
      status: 'OPEN',
      assignedUserId: admin.id,
    })
    .returning();
  if (!c) throw new Error('case insert failed');

  console.log(`▸ Created case ${c.id}`);

  let exitCode = 0;
  try {
    const trigger = 'DOCUMENTS_PENDING' as const;
    const runOne = () =>
      db.transaction(async (tx) => {
        return generateCaseTasks(tx, {
          caseId: c.id,
          trigger,
          actorUserId: admin.id,
          caseAssignedUserId: admin.id,
        });
      });

    // Fire 5 concurrent runs — more attempts = higher probability of seeing the race.
    // Promise.allSettled so ONE failure doesn't hide the results of the others.
    const settled = await Promise.allSettled([runOne(), runOne(), runOne(), runOne(), runOne()]);
    const summary = settled.map((s, i) =>
      s.status === 'fulfilled'
        ? `#${i}=${s.value.created}`
        : `#${i}=REJ(${((s.reason as Error).message ?? '').slice(0, 40)})`,
    );
    console.log(`▸ Concurrent runs: [${summary.join(', ')}]`);

    const rows = await db
      .select({ title: tasks.title, n: sql<number>`COUNT(*)::int` })
      .from(tasks)
      .where(eq(tasks.immigrationCaseId, c.id))
      .groupBy(tasks.title);

    console.log('▸ Task counts after 5× concurrent fire:');
    let duplicates = 0;
    for (const r of rows) {
      const marker = r.n > 1 ? '❌ DUPLICATE' : '✓';
      console.log(`   ${marker}  ${r.n}× ${r.title}`);
      if (r.n > 1) duplicates += r.n - 1;
    }

    if (duplicates > 0) {
      console.log(`\n❌ RACE CONFIRMED — ${duplicates} duplicate task(s) created`);
      exitCode = 2;
    } else {
      console.log(`\n✓ NO DUPLICATES observed on this run`);
      console.log(
        '  (may still be racy under heavier load — a partial unique index is the reliable fix)',
      );
    }
  } finally {
    await db.delete(tasks).where(eq(tasks.immigrationCaseId, c.id));
    await db.delete(immigrationCases).where(eq(immigrationCases.id, c.id));
    await db.delete(persons).where(eq(persons.id, p.id));
    console.log(`▸ Cleaned up fixtures`);
    process.exit(exitCode);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
