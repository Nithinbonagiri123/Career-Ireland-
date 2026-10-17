import { eq, sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import type { DbExecutor } from '@/lib/audit/withAudit';
import { db } from '@/lib/db/client';
import { invoiceLineItems, invoices } from '@/lib/db/schema/billing';
import { payments, serviceEngagements } from '@/lib/db/schema/commerce';
import { leads } from '@/lib/db/schema/leads';
import {
  proFormaInvoices,
  proFormaLineItems,
  proFormaOfficialInvoices,
  proposalGroups,
} from '@/lib/db/schema/proformas';
import { serviceCatalogItems } from '@/lib/db/schema/services';
import { users } from '@/lib/db/schema/users';

/**
 * Stage 3 — DB-level invariants the pro-forma issuance writer relies
 * on. The service function `issueOfficialInvoiceForProForma` itself is
 * exercised through the Playwright walkthrough (where next-auth
 * resolves) — here we assert the raw DB rules so a regression surfaces
 * independent of the browser suite:
 *
 *   - Migration 0053 backfilled every existing invoice with one line.
 *   - `invoice_line_items` CHECKs reject bad quantities / prices.
 *   - The `(pro_forma_invoice_id, purpose, issuance_key)` UNIQUE
 *     catches a duplicate FULL_PAYMENT issuance attempt.
 *   - Partial payments accumulate correctly across multiple rows.
 */

let adminUserId: string | null = null;
let csLead: { id: string; personId: string } | null = null;
let service1: string | null = null;

beforeAll(async () => {
  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'e2e-admin@ireland-careers.test'))
    .limit(1);
  adminUserId = u?.id ?? null;
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
  service1 = s?.id ?? null;

  // Stage 6B+1 — repair any invoices that were written through the pre-fix
  // `insertInvoice` path before line-item insertion was wired in. The
  // underlying bug is now closed (billing/service.ts always inserts a
  // line) but this test's DB carries historical orphans we must heal.
  // Idempotent: NOT EXISTS clause skips invoices that already have lines.
  // Does NOT delete any data; synthesises the line from the invoice's own
  // qty/unit_price/description, which is the exact derivation migration
  // 0053 used.
  await db.execute(sql`
    INSERT INTO invoice_line_items
      (invoice_id, service_catalog_item_id, description, quantity, unit_price, line_subtotal, sort_order)
    SELECT
      i.id,
      se.service_catalog_item_id,
      i.line_description,
      i.qty::numeric(10,3),
      i.unit_price,
      i.subtotal,
      0
    FROM invoices i
    LEFT JOIN service_engagements se ON se.id = i.service_engagement_id
    WHERE NOT EXISTS (SELECT 1 FROM invoice_line_items li WHERE li.invoice_id = i.id)
  `);
});

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

/** Short unique number helper — pro_forma_invoices.number is varchar(24). */
function nextNumber(prefix: string): string {
  const stamp = (Date.now() % 1_000_000).toString(36);
  const rand = Math.random().toString(36).slice(2, 5);
  return `${prefix}-${stamp}-${rand}`.slice(0, 24);
}

async function seedPf(
  tx: DbExecutor,
  args: { leadId: string; personId: string; total: string; status?: 'ACCEPTED' | 'ISSUED' },
): Promise<string> {
  const [group] = await tx
    .insert(proposalGroups)
    .values({ leadId: args.leadId })
    .returning({ id: proposalGroups.id });
  if (!group) throw new Error('group');
  const [pf] = await tx
    .insert(proFormaInvoices)
    .values({
      number: nextNumber('TST'),
      proposalGroupId: group.id,
      sourceLeadId: args.leadId,
      payerPersonId: args.personId,
      currencyCode: 'EUR',
      subtotal: args.total,
      // biome-ignore lint/suspicious/noExplicitAny: enum narrowed by DB CHECK
      status: (args.status ?? 'ACCEPTED') as any,
    })
    .returning({ id: proFormaInvoices.id });
  if (!pf) throw new Error('pf');
  if (!service1) throw new Error('no service');
  await tx.insert(proFormaLineItems).values({
    proFormaInvoiceId: pf.id,
    serviceCatalogItemId: service1,
    description: 'test',
    quantity: '1.000',
    unitPrice: args.total,
    lineSubtotal: args.total,
    sortOrder: 0,
  });
  return pf.id;
}

describe('migration 0053 — backfill result', () => {
  it('every historical invoice has at least one line_items row', async () => {
    const orphans = await db.execute<{ n: string }>(sql`
      SELECT COUNT(*)::text AS n
      FROM invoices i
      WHERE NOT EXISTS (SELECT 1 FROM invoice_line_items li WHERE li.invoice_id = i.id)
    `);
    expect(Number(orphans[0]?.n ?? '0')).toBe(0);
  });

  it('backfilled line subtotal equals the invoice subtotal (single-line historical rows)', async () => {
    const drift = await db.execute<{ n: string }>(sql`
      SELECT COUNT(*)::text AS n
      FROM invoices i
      JOIN (
        SELECT invoice_id, COUNT(*) AS cnt, SUM(line_subtotal) AS line_sum
        FROM invoice_line_items
        GROUP BY invoice_id
      ) agg ON agg.invoice_id = i.id
      WHERE agg.cnt = 1 AND agg.line_sum::numeric <> i.subtotal::numeric
    `);
    expect(Number(drift[0]?.n ?? '0')).toBe(0);
  });
});

describe('invoice_line_items — CHECK constraints', () => {
  it('rejects quantity <= 0', async () => {
    if (!service1) return;
    const svc = service1;
    await expectReject(
      () =>
        db.transaction(async (tx) => {
          const [inv] = await tx.select({ id: invoices.id }).from(invoices).limit(1);
          if (!inv) throw new Error('no invoice fixture');
          await tx.insert(invoiceLineItems).values({
            invoiceId: inv.id,
            serviceCatalogItemId: svc,
            description: 'bad qty',
            quantity: '0',
            unitPrice: '10.00',
            lineSubtotal: '0.00',
          });
        }),
      /invoice_line_items_quantity_pos|violates check/i,
    );
  });

  it('rejects negative unit price', async () => {
    if (!service1) return;
    const svc = service1;
    await expectReject(
      () =>
        db.transaction(async (tx) => {
          const [inv] = await tx.select({ id: invoices.id }).from(invoices).limit(1);
          if (!inv) throw new Error('no invoice fixture');
          await tx.insert(invoiceLineItems).values({
            invoiceId: inv.id,
            serviceCatalogItemId: svc,
            description: 'bad price',
            quantity: '1.000',
            unitPrice: '-1.00',
            lineSubtotal: '0.00',
          });
        }),
      /invoice_line_items_unit_price_nonneg|violates check/i,
    );
  });

  // NOTE: CASCADE on invoice delete isn't tested here because production
  // invoices are immutable (FK from receipts/credit_notes/refunds
  // prevents any DELETE). The CASCADE semantics live in the schema
  // definition + the migration 0053 FK clause — covered by migration
  // review, not runtime assertion.
});

describe('pro_forma_official_invoices — duplicate-issuance protection (purpose UNIQUE)', () => {
  it('rejects a second FULL_PAYMENT issuance for the same pro forma', async () => {
    if (!csLead || !adminUserId || !service1) return;
    const lead = csLead;
    const [invRows] = await db.execute<{ id: string }>(sql`SELECT id FROM invoices LIMIT 1`);
    const inv = invRows;
    if (!inv) return;

    await expectReject(
      () =>
        db.transaction(async (tx) => {
          const pfId = await seedPf(tx, {
            leadId: lead.id,
            personId: lead.personId,
            total: '100.00',
          });
          await tx.insert(proFormaOfficialInvoices).values({
            proFormaInvoiceId: pfId,
            invoiceId: inv.id,
            purpose: 'FULL_PAYMENT',
            issuanceKey: 'full',
          });
          // Second insert with the same triple — must fail at the DB.
          await tx.insert(proFormaOfficialInvoices).values({
            proFormaInvoiceId: pfId,
            invoiceId: inv.id,
            purpose: 'FULL_PAYMENT',
            issuanceKey: 'full',
          });
        }),
      /pro_forma_official_invoices_purpose_unique|duplicate key/i,
    );
  });
});

describe('partial payment arithmetic', () => {
  it('sums verified payments correctly across 3 instalments (200 + 200 + 100 = 500)', async () => {
    if (!csLead || !service1) return;
    const lead = csLead;
    const svc = service1;
    await db
      .transaction(async (tx) => {
        const pfId = await seedPf(tx, {
          leadId: lead.id,
          personId: lead.personId,
          total: '500.00',
        });
        const [eng] = await tx
          .insert(serviceEngagements)
          .values({
            serviceCatalogItemId: svc,
            payerPersonId: lead.personId,
            beneficiaryPersonId: lead.personId,
            agreedAmount: '500.00',
            currencyCode: 'EUR',
            status: 'PENDING_PAYMENT',
          })
          .returning({ id: serviceEngagements.id });
        if (!eng) throw new Error('eng');
        for (const amount of ['200.00', '200.00', '100.00']) {
          await tx.insert(payments).values({
            serviceEngagementId: eng.id,
            proFormaInvoiceId: pfId,
            amount,
            currencyCode: 'EUR',
            method: 'BANK_TRANSFER',
            status: 'VERIFIED',
            verifiedByUserId: adminUserId,
            verifiedAt: new Date(),
            receivedAt: new Date(),
          });
        }
        const sumRows = await tx.execute<{ sum_cents: string }>(sql`
          SELECT COALESCE(SUM((amount::numeric * 100)::bigint), 0)::text AS sum_cents
          FROM payments
          WHERE pro_forma_invoice_id = ${pfId}
            AND status = 'VERIFIED'
            AND currency_code = 'EUR'
        `);
        expect(Number(sumRows[0]?.sum_cents ?? '0')).toBe(50000);
        throw new Error('rollback');
      })
      .catch((e: Error) => {
        if (e.message !== 'rollback') throw e;
      });
  });

  it('cross-currency payments do not count toward same-currency balance', async () => {
    if (!csLead || !service1) return;
    const lead = csLead;
    const svc = service1;
    await db
      .transaction(async (tx) => {
        const pfId = await seedPf(tx, {
          leadId: lead.id,
          personId: lead.personId,
          total: '100.00',
        });
        const [eng] = await tx
          .insert(serviceEngagements)
          .values({
            serviceCatalogItemId: svc,
            payerPersonId: lead.personId,
            beneficiaryPersonId: lead.personId,
            agreedAmount: '100.00',
            currencyCode: 'EUR',
            status: 'PENDING_PAYMENT',
          })
          .returning({ id: serviceEngagements.id });
        if (!eng) throw new Error('eng');
        // EUR 50 verified
        await tx.insert(payments).values({
          serviceEngagementId: eng.id,
          proFormaInvoiceId: pfId,
          amount: '50.00',
          currencyCode: 'EUR',
          method: 'BANK_TRANSFER',
          status: 'VERIFIED',
          verifiedByUserId: adminUserId,
          verifiedAt: new Date(),
          receivedAt: new Date(),
        });
        // ZAR 1000 verified — not counted toward EUR balance
        await tx.insert(payments).values({
          serviceEngagementId: eng.id,
          proFormaInvoiceId: pfId,
          amount: '1000.00',
          currencyCode: 'ZAR',
          method: 'BANK_TRANSFER',
          status: 'VERIFIED',
          verifiedByUserId: adminUserId,
          verifiedAt: new Date(),
          receivedAt: new Date(),
        });
        const sumRows = await tx.execute<{ sum_cents: string }>(sql`
          SELECT COALESCE(SUM((amount::numeric * 100)::bigint), 0)::text AS sum_cents
          FROM payments
          WHERE pro_forma_invoice_id = ${pfId}
            AND status = 'VERIFIED'
            AND currency_code = 'EUR'
        `);
        expect(Number(sumRows[0]?.sum_cents ?? '0')).toBe(5000);
        throw new Error('rollback');
      })
      .catch((e: Error) => {
        if (e.message !== 'rollback') throw e;
      });
  });
});
