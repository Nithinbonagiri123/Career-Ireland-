import { eq, sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db/client';
import { invoices } from './billing';
import { leads } from './leads';
import { persons } from './persons';
import {
  proFormaInvoices,
  proFormaLineItems,
  proFormaOfficialInvoices,
  proposalGroups,
} from './proformas';

/**
 * Stage 1 schema regression tests. These assert the invariants the pro-
 * forma tables rely on so the Stage 2 service layer can trust them —
 * notably the duplicate-issuance protection (UNIQUE on invoice_id in
 * pro_forma_official_invoices) and the money / quantity CHECK
 * constraints.
 *
 * Drizzle wraps every postgres error with "Failed query: ..." on
 * .message, hiding the constraint name. The underlying constraint
 * message lives on .cause. `errorText(e)` walks the whole chain so our
 * matchers can inspect the real postgres text.
 */

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

async function expectRejectMatching(fn: () => Promise<unknown>, pattern: RegExp): Promise<void> {
  let caught: unknown;
  try {
    await fn();
  } catch (e) {
    caught = e;
  }
  expect(caught, 'expected the promise to reject').toBeDefined();
  expect(errorText(caught)).toMatch(pattern);
}

let fixturePerson: { id: string } | null = null;
let fixtureLead: { id: string } | null = null;

beforeAll(async () => {
  const [p] = await db.select({ id: persons.id }).from(persons).limit(1);
  fixturePerson = p ?? null;
  const [l] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(eq(leads.targetBusiness, 'CANDIDATE_SERVICES'))
    .limit(1);
  fixtureLead = l ?? null;
});

describe('pro_forma_invoices — DB constraints', () => {
  it('rejects a negative subtotal (CHECK constraint)', async () => {
    if (!fixturePerson || !fixtureLead) return;
    const person = fixturePerson;
    const lead = fixtureLead;
    await expectRejectMatching(
      () =>
        db.transaction(async (tx) => {
          await tx.insert(proFormaInvoices).values({
            number: `TEST-NEG-${Date.now()}`,
            sourceLeadId: lead.id,
            payerPersonId: person.id,
            currencyCode: 'EUR',
            subtotal: '-1.00',
          });
        }),
      /pro_forma_invoices_subtotal_nonneg/,
    );
  });

  it('rejects a revision < 1 (CHECK constraint)', async () => {
    if (!fixturePerson || !fixtureLead) return;
    const person = fixturePerson;
    const lead = fixtureLead;
    await expectRejectMatching(
      () =>
        db.transaction(async (tx) => {
          await tx.insert(proFormaInvoices).values({
            number: `TEST-REV-${Date.now()}`,
            sourceLeadId: lead.id,
            payerPersonId: person.id,
            currencyCode: 'EUR',
            revision: 0,
          });
        }),
      /pro_forma_invoices_revision_pos/,
    );
  });

  it('rejects a bad currency code (FK constraint)', async () => {
    if (!fixturePerson || !fixtureLead) return;
    const person = fixturePerson;
    const lead = fixtureLead;
    await expectRejectMatching(
      () =>
        db.transaction(async (tx) => {
          await tx.insert(proFormaInvoices).values({
            number: `TEST-CUR-${Date.now()}`,
            sourceLeadId: lead.id,
            payerPersonId: person.id,
            currencyCode: 'XXX',
          });
        }),
      /currencies|foreign key/i,
    );
  });

  // NOTE: pro_forma_invoices.status is a plain `text` column with a
  // Drizzle TS-level enum — there is no PG enum type or CHECK constraint
  // on it. The TS layer prevents invalid values. Stage 2 can add a DB
  // CHECK if we want defense-in-depth; not asserting at DB level today.
});

describe('pro_forma_line_items — CHECK constraints', () => {
  it('rejects quantity <= 0', async () => {
    if (!fixturePerson || !fixtureLead) return;
    const person = fixturePerson;
    const lead = fixtureLead;
    await expectRejectMatching(
      () =>
        db.transaction(async (tx) => {
          const [pfi] = await tx
            .insert(proFormaInvoices)
            .values({
              number: `TEST-LI-Q-${Date.now()}`,
              sourceLeadId: lead.id,
              payerPersonId: person.id,
              currencyCode: 'EUR',
            })
            .returning({ id: proFormaInvoices.id });
          if (!pfi) throw new Error('insert failed');
          const svcRows = await tx.execute<{ id: string }>(
            sql`SELECT id FROM service_catalog_items LIMIT 1`,
          );
          const svc = svcRows[0];
          if (!svc) throw new Error('no service catalog item for test');
          await tx.insert(proFormaLineItems).values({
            proFormaInvoiceId: pfi.id,
            serviceCatalogItemId: svc.id,
            description: 'bad qty',
            quantity: '0',
            unitPrice: '100.00',
            lineSubtotal: '0.00',
          });
        }),
      /pro_forma_line_items_quantity_pos/,
    );
  });

  it('rejects negative unit price', async () => {
    if (!fixturePerson || !fixtureLead) return;
    const person = fixturePerson;
    const lead = fixtureLead;
    await expectRejectMatching(
      () =>
        db.transaction(async (tx) => {
          const [pfi] = await tx
            .insert(proFormaInvoices)
            .values({
              number: `TEST-LI-P-${Date.now()}`,
              sourceLeadId: lead.id,
              payerPersonId: person.id,
              currencyCode: 'EUR',
            })
            .returning({ id: proFormaInvoices.id });
          if (!pfi) throw new Error('insert failed');
          const svcRows = await tx.execute<{ id: string }>(
            sql`SELECT id FROM service_catalog_items LIMIT 1`,
          );
          const svc = svcRows[0];
          if (!svc) throw new Error('no service catalog item for test');
          // lineSubtotal set to 0 so the line_subtotal_nonneg check
          // passes — we want unit_price_nonneg to be the constraint
          // that fires, which is what this test is asserting.
          await tx.insert(proFormaLineItems).values({
            proFormaInvoiceId: pfi.id,
            serviceCatalogItemId: svc.id,
            description: 'bad price',
            quantity: '1',
            unitPrice: '-5.00',
            lineSubtotal: '0.00',
          });
        }),
      /pro_forma_line_items_unit_price_nonneg/,
    );
  });

  it('cascades line items on parent delete', async () => {
    if (!fixturePerson || !fixtureLead) return;
    const person = fixturePerson;
    const lead = fixtureLead;
    await db
      .transaction(async (tx) => {
        const [pfi] = await tx
          .insert(proFormaInvoices)
          .values({
            number: `TEST-CASC-${Date.now()}`,
            sourceLeadId: lead.id,
            payerPersonId: person.id,
            currencyCode: 'EUR',
          })
          .returning({ id: proFormaInvoices.id });
        if (!pfi) throw new Error('insert failed');
        const svcRows = await tx.execute<{ id: string }>(
          sql`SELECT id FROM service_catalog_items LIMIT 1`,
        );
        const svc = svcRows[0];
        if (!svc) throw new Error('no service catalog item for test');
        await tx.insert(proFormaLineItems).values({
          proFormaInvoiceId: pfi.id,
          serviceCatalogItemId: svc.id,
          description: 'ok line',
          quantity: '1',
          unitPrice: '50.00',
          lineSubtotal: '50.00',
        });
        await tx.delete(proFormaInvoices).where(eq(proFormaInvoices.id, pfi.id));
        const cntRows = await tx.execute<{ cnt: string }>(
          sql`SELECT COUNT(*)::text AS cnt FROM pro_forma_line_items WHERE pro_forma_invoice_id = ${pfi.id}`,
        );
        expect(Number(cntRows[0]?.cnt ?? '0')).toBe(0);
        throw new Error('rollback');
      })
      .catch((err: Error) => {
        if (err.message !== 'rollback') throw err;
      });
  });
});

describe('pro_forma_official_invoices — duplicate issuance protection', () => {
  it('prevents linking the same official invoice to two pro formas', async () => {
    if (!fixturePerson || !fixtureLead) return;
    const person = fixturePerson;
    const lead = fixtureLead;
    const [invoice] = await db.select({ id: invoices.id }).from(invoices).limit(1);
    if (!invoice) return;

    await expectRejectMatching(
      () =>
        db.transaction(async (tx) => {
          const [pfiA] = await tx
            .insert(proFormaInvoices)
            .values({
              number: `TEST-DUP-A-${Date.now()}`,
              sourceLeadId: lead.id,
              payerPersonId: person.id,
              currencyCode: 'EUR',
            })
            .returning({ id: proFormaInvoices.id });
          const [pfiB] = await tx
            .insert(proFormaInvoices)
            .values({
              number: `TEST-DUP-B-${Date.now()}`,
              sourceLeadId: lead.id,
              payerPersonId: person.id,
              currencyCode: 'EUR',
            })
            .returning({ id: proFormaInvoices.id });
          if (!pfiA || !pfiB) throw new Error('insert failed');
          await tx.insert(proFormaOfficialInvoices).values({
            proFormaInvoiceId: pfiA.id,
            invoiceId: invoice.id,
          });
          await tx.insert(proFormaOfficialInvoices).values({
            proFormaInvoiceId: pfiB.id,
            invoiceId: invoice.id,
          });
        }),
      /pro_forma_official_invoices_invoice_unique|duplicate key/,
    );
  });
});

describe('proposal_groups — FK to leads', () => {
  it('rejects a group pointing at a non-existent lead', async () => {
    await expectRejectMatching(
      () =>
        db.transaction(async (tx) => {
          await tx.insert(proposalGroups).values({
            leadId: '00000000-0000-0000-0000-000000000000',
          });
        }),
      /foreign key|leads/i,
    );
  });
});
