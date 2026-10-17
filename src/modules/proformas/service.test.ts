import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DbExecutor } from '@/lib/audit/withAudit';
import { db } from '@/lib/db/client';
import { leads } from '@/lib/db/schema/leads';
import { proFormaInvoices, proFormaRevisions, proposalGroups } from '@/lib/db/schema/proformas';
import { serviceCatalogItems } from '@/lib/db/schema/services';
import { users } from '@/lib/db/schema/users';

/**
 * Stage 2 integration tests for the pro-forma service.
 *
 * These tests exercise the DB directly — they assume migration 0052 is
 * applied. They do NOT call the service exports (createProForma etc.)
 * because those require an authenticated session; the real server
 * actions are exercised by the e2e suite. Here we assert the
 * **data-layer invariants** that the service relies on:
 *
 *   - partial unique index: only one ACCEPTED per proposal_group
 *   - status CHECK: rejects an unknown status
 *   - purpose+key UNIQUE: duplicate FULL_PAYMENT fails, MILESTONE
 *     with distinct keys both succeed
 *   - revision snapshot UNIQUE per (pro_forma, revision)
 *   - CASCADE delete of revisions when a pro forma is deleted
 *
 * Fixtures: use e2e-admin as creator + any existing CS lead + two
 * active services. Everything mutating runs inside a tx that rolls
 * back on throw.
 */

let _adminUserId: string | null = null;
let csLead: { id: string; personId: string } | null = null;
let _service1: string | null = null;

beforeAll(async () => {
  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'e2e-admin@ireland-careers.test'))
    .limit(1);
  _adminUserId = u?.id ?? null;

  const [l] = await db
    .select({ id: leads.id, personId: leads.personId })
    .from(leads)
    .where(eq(leads.targetBusiness, 'CANDIDATE_SERVICES'))
    .limit(1);
  if (l?.personId) csLead = { id: l.id, personId: l.personId };

  const [s] = await db
    .select({ id: serviceCatalogItems.id })
    .from(serviceCatalogItems)
    .where(eq(serviceCatalogItems.isActive, true))
    .limit(1);
  _service1 = s?.id ?? null;
});

afterAll(async () => {});

function errorText(err: unknown): string {
  const parts: string[] = [];
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur; i++) {
    if (cur instanceof Error) {
      parts.push(cur.message);
      cur = (cur as { cause?: unknown }).cause;
    } else if (typeof cur === 'string') {
      parts.push(cur);
      break;
    } else {
      break;
    }
  }
  return parts.join(' | ');
}

async function expectReject(fn: () => Promise<unknown>, pattern: RegExp): Promise<void> {
  let caught: unknown;
  try {
    await fn();
  } catch (e) {
    caught = e;
  }
  expect(caught, 'expected the promise to reject').toBeDefined();
  expect(errorText(caught)).toMatch(pattern);
}

async function createGroup(tx: DbExecutor, leadId: string): Promise<string> {
  const [g] = await tx
    .insert(proposalGroups)
    .values({ leadId })
    .returning({ id: proposalGroups.id });
  if (!g) throw new Error('group insert');
  return g.id;
}

async function createPf(
  tx: DbExecutor,
  args: { leadId: string; personId: string; groupId: string; number: string; status?: string },
): Promise<string> {
  const [pf] = await tx
    .insert(proFormaInvoices)
    .values({
      number: args.number,
      proposalGroupId: args.groupId,
      sourceLeadId: args.leadId,
      payerPersonId: args.personId,
      currencyCode: 'EUR',
      subtotal: '0.00',
      // biome-ignore lint/suspicious/noExplicitAny: enum narrowed by DB CHECK
      status: (args.status ?? 'ISSUED') as any,
    })
    .returning({ id: proFormaInvoices.id });
  if (!pf) throw new Error('pf insert');
  return pf.id;
}

describe('pro_forma_invoices — status CHECK', () => {
  it('rejects an unknown status (DB CHECK)', async () => {
    if (!csLead) return;
    const lead = csLead;
    await expectReject(
      () =>
        db.transaction(async (tx) => {
          await tx.execute(sql`
            INSERT INTO pro_forma_invoices (number, source_lead_id, payer_person_id, currency_code, status)
            VALUES (${`TEST-ST-${Date.now()}`}, ${lead.id}, ${lead.personId}, 'EUR', 'UNKNOWN_STATUS')
          `);
        }),
      /pro_forma_invoices_status_check|violates check/i,
    );
  });

  it('accepts SUPERSEDED as a legitimate status', async () => {
    if (!csLead) return;
    const lead = csLead;
    await db
      .transaction(async (tx) => {
        const groupId = await createGroup(tx, lead.id);
        await createPf(tx, {
          leadId: lead.id,
          personId: lead.personId,
          groupId,
          number: `TEST-SU-${Date.now()}`,
          status: 'SUPERSEDED',
        });
        throw new Error('rollback');
      })
      .catch((e: Error) => {
        if (e.message !== 'rollback') throw e;
      });
  });
});

describe('pro_forma_invoices — one ACCEPTED per proposal_group', () => {
  it('rejects a second ACCEPTED in the same group (partial unique)', async () => {
    if (!csLead) return;
    const lead = csLead;
    await expectReject(
      () =>
        db.transaction(async (tx) => {
          const groupId = await createGroup(tx, lead.id);
          await createPf(tx, {
            leadId: lead.id,
            personId: lead.personId,
            groupId,
            number: `TEST-A1-${Date.now()}`,
            status: 'ACCEPTED',
          });
          await createPf(tx, {
            leadId: lead.id,
            personId: lead.personId,
            groupId,
            number: `TEST-A2-${Date.now()}`,
            status: 'ACCEPTED',
          });
        }),
      /pro_forma_invoices_one_accepted_per_group|duplicate key/i,
    );
  });

  it('allows ACCEPTED alongside DRAFT / ISSUED / SUPERSEDED in the same group', async () => {
    if (!csLead) return;
    const lead = csLead;
    await db
      .transaction(async (tx) => {
        const groupId = await createGroup(tx, lead.id);
        await createPf(tx, {
          leadId: lead.id,
          personId: lead.personId,
          groupId,
          number: `TEST-M1-${Date.now()}`,
          status: 'ACCEPTED',
        });
        await createPf(tx, {
          leadId: lead.id,
          personId: lead.personId,
          groupId,
          number: `TEST-M2-${Date.now()}`,
          status: 'DRAFT',
        });
        await createPf(tx, {
          leadId: lead.id,
          personId: lead.personId,
          groupId,
          number: `TEST-M3-${Date.now()}`,
          status: 'SUPERSEDED',
        });
        throw new Error('rollback');
      })
      .catch((e: Error) => {
        if (e.message !== 'rollback') throw e;
      });
  });
});

describe('pro_forma_official_invoices — purpose UNIQUE', () => {
  it('rejects a second FULL_PAYMENT for the same pro forma', async () => {
    if (!csLead) return;
    const lead = csLead;
    // Fetch 2 real invoices; if the DB has none, skip the test — the
    // service layer is still exercised elsewhere.
    const invRows = await db.execute<{ id: string }>(sql`SELECT id FROM invoices LIMIT 2`);
    if (invRows.length < 2) return;
    const [inv1, inv2] = invRows;
    if (!inv1 || !inv2) return;

    await expectReject(
      () =>
        db.transaction(async (tx) => {
          const groupId = await createGroup(tx, lead.id);
          const pfId = await createPf(tx, {
            leadId: lead.id,
            personId: lead.personId,
            groupId,
            number: `TEST-DUP-${Date.now()}`,
            status: 'ACCEPTED',
          });
          await tx.execute(sql`
            INSERT INTO pro_forma_official_invoices (pro_forma_invoice_id, invoice_id, purpose, issuance_key)
            VALUES (${pfId}, ${inv1.id}, 'FULL_PAYMENT', 'full')
          `);
          await tx.execute(sql`
            INSERT INTO pro_forma_official_invoices (pro_forma_invoice_id, invoice_id, purpose, issuance_key)
            VALUES (${pfId}, ${inv2.id}, 'FULL_PAYMENT', 'full')
          `);
        }),
      /pro_forma_official_invoices_purpose_unique|duplicate key/i,
    );
  });

  it('allows MILESTONE with distinct keys on the same pro forma', async () => {
    if (!csLead) return;
    const lead = csLead;
    const invRows = await db.execute<{ id: string }>(sql`SELECT id FROM invoices LIMIT 2`);
    if (invRows.length < 2) return;
    const [inv1, inv2] = invRows;
    if (!inv1 || !inv2) return;

    await db
      .transaction(async (tx) => {
        const groupId = await createGroup(tx, lead.id);
        const pfId = await createPf(tx, {
          leadId: lead.id,
          personId: lead.personId,
          groupId,
          number: `TEST-MS-${Date.now()}`,
          status: 'ACCEPTED',
        });
        await tx.execute(sql`
          INSERT INTO pro_forma_official_invoices (pro_forma_invoice_id, invoice_id, purpose, issuance_key)
          VALUES (${pfId}, ${inv1.id}, 'MILESTONE', 'm-1')
        `);
        await tx.execute(sql`
          INSERT INTO pro_forma_official_invoices (pro_forma_invoice_id, invoice_id, purpose, issuance_key)
          VALUES (${pfId}, ${inv2.id}, 'MILESTONE', 'm-2')
        `);
        throw new Error('rollback');
      })
      .catch((e: Error) => {
        if (e.message !== 'rollback') throw e;
      });
  });

  it('rejects an unknown purpose (DB CHECK)', async () => {
    if (!csLead) return;
    const lead = csLead;
    const invRows = await db.execute<{ id: string }>(sql`SELECT id FROM invoices LIMIT 1`);
    const inv = invRows[0];
    if (!inv) return;

    await expectReject(
      () =>
        db.transaction(async (tx) => {
          const groupId = await createGroup(tx, lead.id);
          const pfId = await createPf(tx, {
            leadId: lead.id,
            personId: lead.personId,
            groupId,
            number: `TEST-BP-${Date.now()}`,
            status: 'ACCEPTED',
          });
          await tx.execute(sql`
            INSERT INTO pro_forma_official_invoices (pro_forma_invoice_id, invoice_id, purpose, issuance_key)
            VALUES (${pfId}, ${inv.id}, 'FICTIONAL', 'oops')
          `);
        }),
      /pro_forma_official_invoices_purpose_check|violates check/i,
    );
  });
});

describe('pro_forma_revisions', () => {
  it('rejects duplicate (pro_forma_invoice_id, revision)', async () => {
    if (!csLead) return;
    const lead = csLead;
    await expectReject(
      () =>
        db.transaction(async (tx) => {
          const groupId = await createGroup(tx, lead.id);
          const pfId = await createPf(tx, {
            leadId: lead.id,
            personId: lead.personId,
            groupId,
            number: `TEST-RV-${Date.now()}`,
          });
          await tx
            .insert(proFormaRevisions)
            .values({ proFormaInvoiceId: pfId, revision: 1, snapshot: {} });
          await tx
            .insert(proFormaRevisions)
            .values({ proFormaInvoiceId: pfId, revision: 1, snapshot: {} });
        }),
      /pro_forma_revisions_unique|duplicate key/i,
    );
  });

  it('cascades revisions when the parent pro forma is deleted', async () => {
    if (!csLead) return;
    const lead = csLead;
    await db
      .transaction(async (tx) => {
        const groupId = await createGroup(tx, lead.id);
        const pfId = await createPf(tx, {
          leadId: lead.id,
          personId: lead.personId,
          groupId,
          number: `TEST-CAS-${Date.now()}`,
        });
        await tx
          .insert(proFormaRevisions)
          .values({ proFormaInvoiceId: pfId, revision: 1, snapshot: { was: 'here' } });
        await tx.delete(proFormaInvoices).where(eq(proFormaInvoices.id, pfId));
        const stillThere = await tx
          .select({ id: proFormaRevisions.id })
          .from(proFormaRevisions)
          .where(eq(proFormaRevisions.proFormaInvoiceId, pfId));
        expect(stillThere.length).toBe(0);
        throw new Error('rollback');
      })
      .catch((e: Error) => {
        if (e.message !== 'rollback') throw e;
      });
  });
});

describe('persons.primary_occupation_id FK', () => {
  it('rejects a primary_occupation_id that does not exist in occupations', async () => {
    await expectReject(
      () =>
        db.transaction(async (tx) => {
          await tx.execute(sql`
            INSERT INTO persons (first_name, last_name, primary_occupation_id, source)
            VALUES ('Test', 'FK', '00000000-0000-0000-0000-000000000000', 'DIRECT')
          `);
        }),
      /persons_primary_occupation_id|foreign key|occupations/i,
    );
  });
});
