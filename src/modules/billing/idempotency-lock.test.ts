import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db/client';

/**
 * Stage B Wave 1 — concurrency proof for the idempotent invoice path.
 *
 * Simulates the exact critical section `generateInvoiceForPayer` runs:
 * take a transaction-scoped advisory lock on the idempotency key, look
 * up a prior audit row carrying that key, and only "create" when none
 * exists. Two genuinely concurrent transactions with the same key must
 * produce exactly one creation — the second must observe the first's
 * row after the lock releases and replay it.
 *
 * Runs against the real database and the real audit_events table (the
 * same mechanism the service uses); rows are tagged and removed after.
 */

const KEY = `vitest-idem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ACTION = 'VITEST_IDEMPOTENCY_PROBE';

async function criticalSection(): Promise<'created' | 'replayed'> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`invoice-gen:${KEY}`}))`);
    const rows = await tx.execute<{ id: string }>(sql`
      SELECT id FROM audit_events
      WHERE action = ${ACTION} AND (context ->> 'idempotencyKey') = ${KEY}
      LIMIT 1
    `);
    if ((rows as Array<{ id: string }>).length > 0) return 'replayed';
    // Small delay inside the lock to widen the race window: without the
    // advisory lock this makes the double-create practically certain.
    await new Promise((r) => setTimeout(r, 150));
    await tx.execute(sql`
      INSERT INTO audit_events (entity_type, entity_id, action, context)
      VALUES ('invoice', gen_random_uuid(), ${ACTION}, ${JSON.stringify({ idempotencyKey: KEY })}::jsonb)
    `);
    return 'created';
  });
}

afterAll(async () => {
  await db.execute(sql`DELETE FROM audit_events WHERE action = ${ACTION}`);
});

describe('idempotency advisory lock', () => {
  it('two concurrent same-key submissions create exactly once', async () => {
    const [a, b] = await Promise.all([criticalSection(), criticalSection()]);
    expect([a, b].sort()).toEqual(['created', 'replayed']);

    const rows = await db.execute<{ n: string }>(sql`
      SELECT COUNT(*)::text AS n FROM audit_events
      WHERE action = ${ACTION} AND (context ->> 'idempotencyKey') = ${KEY}
    `);
    expect((rows as Array<{ n: string }>)[0]?.n).toBe('1');
  });
});
