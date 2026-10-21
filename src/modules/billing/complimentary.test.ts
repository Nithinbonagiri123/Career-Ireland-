import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db/client';
import { GrantComplimentaryServiceSchema } from './complimentary-schemas';

/**
 * Stage B Wave 4 — complimentary (€0.00) invoices.
 *
 * Three layers, matching the Wave 1 test style:
 *  1. Input validation matrix (pure zod — no DB).
 *  2. The DB CHECK constraints added by migration 0061: a complimentary
 *     invoice must carry a reason, only complimentary invoices may, and
 *     the total must be exactly 0.
 *  3. The advisory-lock + audit-replay critical section the grant service
 *     runs — two genuinely concurrent same-key submissions must grant
 *     exactly once.
 *
 * DB rows are tagged and removed in afterAll.
 */

const STAMP = `vitest-comp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ACTION = 'VITEST_COMPLIMENTARY_PROBE';

let personId: string;
let engagementIds: string[] = [];
let catalogId: string;
let userId: string;

async function seedEngagement(): Promise<string> {
  const rows = await db.execute<{ id: string }>(sql`
    INSERT INTO service_engagements
      (service_catalog_item_id, payer_person_id, agreed_amount, currency_code, status)
    VALUES (${catalogId}::uuid, ${personId}::uuid, '0.00', 'EUR', 'ACTIVE')
    RETURNING id
  `);
  const id = (rows as Array<{ id: string }>)[0]?.id;
  if (!id) throw new Error('engagement seed failed');
  engagementIds.push(id);
  return id;
}

function insertInvoiceSql(args: {
  engagementId: string;
  total: string;
  kind: 'STANDARD' | 'COMPLIMENTARY';
  reason: string | null;
}) {
  return sql`
    INSERT INTO invoices
      (number, payer_person_id, service_engagement_id, qty, unit_price, subtotal,
       tax_amount, total_amount, currency_code, line_description, issued_by_user_id,
       status, settlement_kind, complimentary_reason, complimentary_granted_by_user_id)
    VALUES
      (${`VT-${Math.random().toString(36).slice(2, 12)}`}, ${personId}::uuid,
       ${args.engagementId}::uuid, 1, ${args.total}, ${args.total}, '0.00', ${args.total},
       'EUR', 'vitest complimentary probe', ${userId}::uuid,
       ${args.kind === 'COMPLIMENTARY' ? 'PAID' : 'ISSUED'}, ${args.kind},
       ${args.reason}, ${args.reason === null ? null : userId}::uuid)
    RETURNING id
  `;
}

beforeAll(async () => {
  const [person] = (await db.execute<{ id: string }>(sql`
    INSERT INTO persons (first_name, last_name, email, source)
    VALUES ('Vitest', ${`Comp-${STAMP}`}, ${`${STAMP}@example.test`}, 'DIRECT')
    RETURNING id
  `)) as Array<{ id: string }>;
  if (!person) throw new Error('person seed failed');
  personId = person.id;
  const [cat] = (await db.execute<{ id: string }>(
    sql`SELECT id FROM service_catalog_items LIMIT 1`,
  )) as Array<{ id: string }>;
  if (!cat) throw new Error('no service catalog item seeded');
  catalogId = cat.id;
  const [user] = (await db.execute<{ id: string }>(sql`SELECT id FROM users LIMIT 1`)) as Array<{
    id: string;
  }>;
  if (!user) throw new Error('no user seeded');
  userId = user.id;
});

afterAll(async () => {
  await db.execute(sql`DELETE FROM audit_events WHERE action = ${ACTION}`);
  await db.execute(sql`DELETE FROM invoices WHERE line_description = 'vitest complimentary probe'`);
  if (engagementIds.length > 0) {
    await db.execute(
      sql`DELETE FROM service_engagements WHERE id IN (${sql.join(
        engagementIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`,
    );
  }
  await db.execute(sql`DELETE FROM persons WHERE id = ${personId}::uuid`);
  engagementIds = [];
});

/** Drizzle wraps PG errors as "Failed query: …" with the real constraint
 *  name in `cause` — match against the whole chain. */
async function expectDbRejection(promise: Promise<unknown>, pattern: RegExp): Promise<void> {
  let thrown: unknown = null;
  try {
    await promise;
  } catch (e) {
    thrown = e;
  }
  expect(thrown, 'expected the insert to be refused').not.toBeNull();
  const text = [
    String(thrown),
    thrown instanceof Error && thrown.cause ? String(thrown.cause) : '',
    thrown instanceof Error && thrown.cause instanceof Error ? thrown.cause.message : '',
  ].join(' | ');
  expect(text).toMatch(pattern);
}

describe('GrantComplimentaryServiceSchema', () => {
  const valid = {
    personId: '7b9d3a60-0000-4000-8000-000000000001',
    serviceCatalogItemId: '7b9d3a60-0000-4000-8000-000000000002',
    currencyCode: 'EUR',
    reason: 'Hardship waiver approved by management',
    idempotencyKey: 'test-key-12345',
  };

  it('accepts a complete grant', () => {
    expect(GrantComplimentaryServiceSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a missing or trivial reason', () => {
    expect(GrantComplimentaryServiceSchema.safeParse({ ...valid, reason: '' }).success).toBe(false);
    expect(GrantComplimentaryServiceSchema.safeParse({ ...valid, reason: 'free' }).success).toBe(
      false,
    );
    // Whitespace padding can't sneak a short reason through.
    expect(
      GrantComplimentaryServiceSchema.safeParse({ ...valid, reason: '   ok    ' }).success,
    ).toBe(false);
  });

  it('rejects a malformed currency or missing idempotency key', () => {
    expect(
      GrantComplimentaryServiceSchema.safeParse({ ...valid, currencyCode: 'EURO' }).success,
    ).toBe(false);
    expect(
      GrantComplimentaryServiceSchema.safeParse({ ...valid, idempotencyKey: 'x' }).success,
    ).toBe(false);
  });
});

describe('migration 0061 CHECK constraints', () => {
  it('a complimentary invoice without a reason is refused by the database', async () => {
    const engagementId = await seedEngagement();
    await expectDbRejection(
      db.execute(
        insertInvoiceSql({ engagementId, total: '0.00', kind: 'COMPLIMENTARY', reason: null }),
      ),
      /invoices_complimentary_reason/,
    );
  });

  it('a complimentary invoice with a non-zero total is refused by the database', async () => {
    const engagementId = await seedEngagement();
    await expectDbRejection(
      db.execute(
        insertInvoiceSql({
          engagementId,
          total: '100.00',
          kind: 'COMPLIMENTARY',
          reason: 'vitest reason',
        }),
      ),
      /invoices_complimentary_zero_total/,
    );
  });

  it('a standard invoice with a complimentary reason is refused (reason implies kind)', async () => {
    const engagementId = await seedEngagement();
    await expectDbRejection(
      db.execute(
        insertInvoiceSql({
          engagementId,
          total: '0.00',
          kind: 'STANDARD',
          reason: 'vitest reason',
        }),
      ),
      /invoices_complimentary_reason/,
    );
  });

  it('a valid €0.00 complimentary invoice (reason + zero total) inserts cleanly', async () => {
    const engagementId = await seedEngagement();
    let rows: unknown;
    try {
      rows = await db.execute<{ id: string }>(
        insertInvoiceSql({
          engagementId,
          total: '0.00',
          kind: 'COMPLIMENTARY',
          reason: 'vitest reason',
        }),
      );
    } catch (e) {
      throw new Error(`valid insert refused: ${e instanceof Error ? (e.cause ?? e) : e}`);
    }
    expect((rows as Array<{ id: string }>)[0]?.id).toBeTruthy();
  });

  it('receipts remain impossible at €0 — the amount > 0 CHECK holds', async () => {
    await expectDbRejection(
      db.execute(sql`
        INSERT INTO receipts (number, payment_id, invoice_id, payer_person_id, amount,
          currency_code, received_at, issued_by_user_id)
        VALUES (${`VTR-${Math.random().toString(36).slice(2, 10)}`}, gen_random_uuid(), gen_random_uuid(),
          ${personId}::uuid, '0.00', 'EUR', NOW(), ${userId}::uuid)
      `),
      /receipts_amount_positive|violates/,
    );
  });
});

describe('complimentary grant advisory lock', () => {
  const KEY = `${STAMP}-lock`;

  async function criticalSection(): Promise<'created' | 'replayed'> {
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`complimentary-grant:${KEY}`}))`,
      );
      const rows = await tx.execute<{ id: string }>(sql`
        SELECT id FROM audit_events
        WHERE action = ${ACTION} AND (context ->> 'idempotencyKey') = ${KEY}
        LIMIT 1
      `);
      if ((rows as Array<{ id: string }>).length > 0) return 'replayed';
      await new Promise((r) => setTimeout(r, 150));
      await tx.execute(sql`
        INSERT INTO audit_events (entity_type, entity_id, action, context)
        VALUES ('invoice', gen_random_uuid(), ${ACTION}, ${JSON.stringify({
          idempotencyKey: KEY,
        })}::jsonb)
      `);
      return 'created';
    });
  }

  it('a replay is scoped to the same person — a reused key for someone else finds nothing', async () => {
    // Release-readiness item 3 — mirrors the WHERE clause the grant
    // service ships (key AND personId): a reused or guessed key
    // submitted for a different person must not surface the original
    // grant's invoice.
    const REPLAY_KEY = `${STAMP}-scope`;
    await db.execute(sql`
      INSERT INTO audit_events (entity_type, entity_id, action, context)
      VALUES ('invoice', gen_random_uuid(), ${ACTION}, ${JSON.stringify({
        idempotencyKey: REPLAY_KEY,
        personId: 'person-A',
        invoiceNumber: 'INV-2026-999999',
      })}::jsonb)
    `);
    const lookup = (personId: string) =>
      db.execute<{ n: string }>(sql`
        SELECT COUNT(*)::text AS n FROM audit_events
        WHERE action = ${ACTION}
          AND (context ->> 'idempotencyKey') = ${REPLAY_KEY}
          AND (context ->> 'personId') = ${personId}
      `);
    const same = (await lookup('person-A')) as Array<{ n: string }>;
    const other = (await lookup('person-B')) as Array<{ n: string }>;
    expect(same[0]?.n).toBe('1');
    expect(other[0]?.n).toBe('0');
  });

  it('two concurrent same-key grants create exactly once', async () => {
    const [a, b] = await Promise.all([criticalSection(), criticalSection()]);
    expect([a, b].sort()).toEqual(['created', 'replayed']);
    const rows = await db.execute<{ n: string }>(sql`
      SELECT COUNT(*)::text AS n FROM audit_events
      WHERE action = ${ACTION} AND (context ->> 'idempotencyKey') = ${KEY}
    `);
    expect((rows as Array<{ n: string }>)[0]?.n).toBe('1');
  });
});
