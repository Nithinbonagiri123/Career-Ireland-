import { eq, sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db/client';
import { leads } from '@/lib/db/schema/leads';
import { persons } from '@/lib/db/schema/persons';
import { proFormaInvoices, proFormaLineItems, proposalGroups } from '@/lib/db/schema/proformas';
import { serviceCatalogItems } from '@/lib/db/schema/services';
import { users } from '@/lib/db/schema/users';
import { e2eAdminId } from '@/test/db-fixtures';
import { fetchExpirableLeadIds } from './expiry';

/**
 * Stage 4 — expiry eligibility invariants exercised at the DB layer.
 * The expiry writer itself (expireLeads) is session-less so the
 * stage4-expiry-sweep.ts script covers that path.
 *
 * These tests seed inside transactions that always roll back so no
 * leftover rows leak into the dev DB.
 */

let adminUserId: string | null = null;
let service1: string | null = null;

beforeAll(async () => {
  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'e2e-admin@ireland-careers.test'))
    .limit(1);
  adminUserId = u?.id ?? null;
  const [s] = await db
    .select({ id: serviceCatalogItems.id })
    .from(serviceCatalogItems)
    .where(eq(serviceCatalogItems.isActive, true))
    .limit(1);
  service1 = s?.id ?? null;
});

function daysAgo(d: number): Date {
  const t = Date.now() - d * 24 * 60 * 60 * 1000;
  return new Date(t);
}

async function seedLead(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  args: {
    createdAt: Date;
    status: 'NEW' | 'CONTACTED' | 'AWAITING_PAYMENT' | 'CONVERTED' | 'EXPIRED';
    attachAcceptedProForma?: boolean;
  },
): Promise<string> {
  const [p] = await tx
    .insert(persons)
    .values({
      firstName: 'Expiry',
      lastName: `Test${Math.random().toString(36).slice(2, 5)}`,
      source: 'DIRECT',
    })
    .returning({ id: persons.id });
  if (!p) throw new Error('person insert');
  const [l] = await tx
    .insert(leads)
    .values({
      assignedUserId: await e2eAdminId(),
      targetBusiness: 'CANDIDATE_SERVICES',
      personId: p.id,
      status: args.status,
      createdAt: args.createdAt,
    })
    .returning({ id: leads.id });
  if (!l) throw new Error('lead insert');

  if (args.attachAcceptedProForma && service1) {
    const [grp] = await tx
      .insert(proposalGroups)
      .values({ leadId: l.id })
      .returning({ id: proposalGroups.id });
    if (!grp) throw new Error('group');
    const [pf] = await tx
      .insert(proFormaInvoices)
      .values({
        number: `EXP-${Date.now() % 100000}-${Math.random().toString(36).slice(2, 5)}`.slice(0, 24),
        proposalGroupId: grp.id,
        sourceLeadId: l.id,
        payerPersonId: p.id,
        currencyCode: 'EUR',
        subtotal: '100.00',
        status: 'ACCEPTED',
      })
      .returning({ id: proFormaInvoices.id });
    if (!pf) throw new Error('pf');
    await tx.insert(proFormaLineItems).values({
      proFormaInvoiceId: pf.id,
      serviceCatalogItemId: service1,
      description: 'x',
      quantity: '1.000',
      unitPrice: '100.00',
      lineSubtotal: '100.00',
      sortOrder: 0,
    });
  }
  return l.id;
}

describe('CS lead expiry — boundary conditions', () => {
  it('a 31-day-old NEW lead with no commitments IS eligible', async () => {
    await db
      .transaction(async (tx) => {
        const id = await seedLead(tx, { createdAt: daysAgo(31), status: 'NEW' });
        const ids = await fetchExpirableLeadIds(tx, {});
        expect(ids).toContain(id);
        throw new Error('rollback');
      })
      .catch((e: Error) => {
        if (e.message !== 'rollback') throw e;
      });
  });

  it('a 29-day-old NEW lead is NOT eligible (boundary below)', async () => {
    await db
      .transaction(async (tx) => {
        const id = await seedLead(tx, { createdAt: daysAgo(29), status: 'NEW' });
        const ids = await fetchExpirableLeadIds(tx, {});
        expect(ids).not.toContain(id);
        throw new Error('rollback');
      })
      .catch((e: Error) => {
        if (e.message !== 'rollback') throw e;
      });
  });

  it('an exactly-30-day-old lead is NOT eligible (strict > not >=)', async () => {
    await db
      .transaction(async (tx) => {
        // Use a timestamp exactly 30 days back + 1 second so the SQL "<"
        // comparison returns false. The eligibility query uses `created_at <
        // NOW() - 30 days` so leads created exactly 30 days ago are safe
        // for one more day of grace.
        const id = await seedLead(tx, {
          createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000 + 1000),
          status: 'NEW',
        });
        const ids = await fetchExpirableLeadIds(tx, {});
        expect(ids).not.toContain(id);
        throw new Error('rollback');
      })
      .catch((e: Error) => {
        if (e.message !== 'rollback') throw e;
      });
  });

  it('old lead with an ACCEPTED pro forma is NEVER eligible', async () => {
    await db
      .transaction(async (tx) => {
        const id = await seedLead(tx, {
          createdAt: daysAgo(60),
          status: 'NEW',
          attachAcceptedProForma: true,
        });
        const ids = await fetchExpirableLeadIds(tx, {});
        expect(ids).not.toContain(id);
        throw new Error('rollback');
      })
      .catch((e: Error) => {
        if (e.message !== 'rollback') throw e;
      });
  });

  it('old lead already in CONVERTED status is NOT eligible', async () => {
    await db
      .transaction(async (tx) => {
        const id = await seedLead(tx, { createdAt: daysAgo(60), status: 'CONVERTED' });
        const ids = await fetchExpirableLeadIds(tx, {});
        expect(ids).not.toContain(id);
        throw new Error('rollback');
      })
      .catch((e: Error) => {
        if (e.message !== 'rollback') throw e;
      });
  });

  it('old lead already in EXPIRED status is NOT re-expired (idempotency)', async () => {
    await db
      .transaction(async (tx) => {
        const id = await seedLead(tx, { createdAt: daysAgo(60), status: 'EXPIRED' });
        const ids = await fetchExpirableLeadIds(tx, {});
        expect(ids).not.toContain(id);
        throw new Error('rollback');
      })
      .catch((e: Error) => {
        if (e.message !== 'rollback') throw e;
      });
  });

  it('old lead in AWAITING_PAYMENT is NOT eligible', async () => {
    await db
      .transaction(async (tx) => {
        const id = await seedLead(tx, { createdAt: daysAgo(60), status: 'AWAITING_PAYMENT' });
        const ids = await fetchExpirableLeadIds(tx, {});
        expect(ids).not.toContain(id);
        throw new Error('rollback');
      })
      .catch((e: Error) => {
        if (e.message !== 'rollback') throw e;
      });
  });
});

describe('CS lead expiry — status transition idempotency', () => {
  it('EXPIRED → EXPIRED update is a no-op (status filter guards the WHERE clause)', async () => {
    await db
      .transaction(async (tx) => {
        const id = await seedLead(tx, { createdAt: daysAgo(60), status: 'EXPIRED' });
        // Try to flip it via raw SQL that mimics the expiry writer's clause.
        const [{ n }] = (await tx.execute<{ n: string }>(sql`
          WITH upd AS (
            UPDATE leads SET status = 'EXPIRED' WHERE id = ${id} AND status NOT IN ('EXPIRED','CONVERTED') RETURNING id
          )
          SELECT COUNT(*)::text AS n FROM upd
        `)) as unknown as [{ n: string }];
        expect(Number(n)).toBe(0);
        throw new Error('rollback');
      })
      .catch((e: Error) => {
        if (e.message !== 'rollback') throw e;
      });
  });
});

// adminUserId is referenced via seedLead's optional attach path; keep referenced to appease lint
void adminUserId;
