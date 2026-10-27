import { and, eq, sql } from 'drizzle-orm';
import { type DbExecutor, recordAudit } from '@/lib/audit/withAudit';
import { assertFinanceActor } from '@/lib/auth/finance-policy';
import { type Invoice, invoiceLineItems, invoices } from '@/lib/db/schema/billing';
import { payments } from '@/lib/db/schema/commerce';
import {
  type ProFormaOfficialInvoicePurpose,
  proFormaInvoices,
  proFormaLineItems,
  proFormaOfficialInvoices,
} from '@/lib/db/schema/proformas';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import { emitFinancialEvent } from '@/modules/accounting/events';
import { resolveDivisionForInvoice } from '@/modules/accounting/rule-engine';
import { allocateNextNumber } from '@/modules/billing/service';
import { centsToMoney, moneyToCents, sumCents } from './money';

/**
 * Payment-triggered official invoice issuance — Stage 3.
 *
 * Called from `verifyPaymentForProForma` once the verified-payment sum
 * reaches the pro-forma total. Produces one official invoice carrying
 * all of the pro forma's line items verbatim.
 *
 * ── Idempotency ──────────────────────────────────────────────────────
 * The caller passes `purpose` + `issuanceKey` (`'FULL_PAYMENT'` + `'full'`
 * for the normal flow). If a row already exists in
 * `pro_forma_official_invoices` for that triple, we return the existing
 * invoice unchanged — no new INV number, no new line items. The DB-level
 * `UNIQUE(pro_forma_invoice_id, purpose, issuance_key)` is the final
 * backstop; the pre-check here keeps the error surface clean.
 *
 * ── Concurrency ──────────────────────────────────────────────────────
 * Caller MUST hold `FOR UPDATE` on the pro forma row before calling.
 * `verifyPaymentForProForma` does that; direct callers must as well.
 *
 * ── Multi-line parity ────────────────────────────────────────────────
 * The invoice carries all pro-forma lines in `invoice_line_items`. The
 * legacy single-line columns (`qty`, `unit_price`, `line_description`)
 * are populated from the first line + a summary ("Line A + N more") so
 * the Stage 1 printable + aging report + ledger payload keep working
 * until Stage 4 migrates those readers.
 *
 * ── VAT ──────────────────────────────────────────────────────────────
 * Hard-coded to `OUTSIDE_SCOPE` + `taxAmount='0.00'` while the business
 * remains non-VAT-registered. The invoice total equals the pro-forma
 * subtotal. When VAT registration kicks in (post-Stage 3), the writer
 * branches on `app_settings.vatRegistered` + effective date.
 */

export type IssueProFormaArgs = {
  proFormaInvoiceId: string;
  purpose: ProFormaOfficialInvoicePurpose;
  issuanceKey: string;
  issuedByUserId: string;
};

export async function issueOfficialInvoiceForProForma(
  tx: DbExecutor,
  args: IssueProFormaArgs,
): Promise<Invoice> {
  // Phase 1 — issuing an official invoice is ISSUE-tier: the issuer must
  // hold finance authority, re-checked here at the side effect itself.
  await assertFinanceActor(tx, args.issuedByUserId, 'ISSUE', 'issueOfficialInvoiceForProForma');
  // 1. Idempotency pre-check. If an invoice already exists for this
  //    (pro_forma, purpose, issuance_key) triple, return it.
  const [existing] = await tx
    .select({ invoiceId: proFormaOfficialInvoices.invoiceId })
    .from(proFormaOfficialInvoices)
    .where(
      and(
        eq(proFormaOfficialInvoices.proFormaInvoiceId, args.proFormaInvoiceId),
        eq(proFormaOfficialInvoices.purpose, args.purpose),
        eq(proFormaOfficialInvoices.issuanceKey, args.issuanceKey),
      ),
    )
    .limit(1);
  if (existing) {
    const [row] = await tx
      .select()
      .from(invoices)
      .where(eq(invoices.id, existing.invoiceId))
      .limit(1);
    if (!row) throw new Error('idempotency row references missing invoice');
    return row;
  }

  // 2. Load the pro forma + line items (caller holds FOR UPDATE on PF).
  const [pf] = await tx
    .select()
    .from(proFormaInvoices)
    .where(eq(proFormaInvoices.id, args.proFormaInvoiceId))
    .limit(1);
  if (!pf) throw new NotFoundError('Pro forma');
  if (pf.status !== 'ACCEPTED' && pf.status !== 'CONVERTED') {
    throw new BusinessRuleError(
      'PROFORMA_NOT_ACCEPTED',
      `Can only issue an invoice from an ACCEPTED pro forma (current: ${pf.status})`,
    );
  }

  const pfLines = await tx
    .select({
      id: proFormaLineItems.id,
      serviceCatalogItemId: proFormaLineItems.serviceCatalogItemId,
      description: proFormaLineItems.description,
      quantity: proFormaLineItems.quantity,
      unitPrice: proFormaLineItems.unitPrice,
      lineSubtotal: proFormaLineItems.lineSubtotal,
      sortOrder: proFormaLineItems.sortOrder,
    })
    .from(proFormaLineItems)
    .where(eq(proFormaLineItems.proFormaInvoiceId, pf.id))
    .orderBy(proFormaLineItems.sortOrder);
  if (pfLines.length === 0) {
    throw new BusinessRuleError('PROFORMA_HAS_NO_LINES', 'Pro forma has no line items');
  }

  // 3. Resolve the service_engagement to anchor the invoice. The payments
  //    writer created one at first-payment time; the Stage 3 writer never
  //    creates one here (if there are no payments yet we shouldn't be
  //    issuing). Pick the engagement from any payment on the pro forma.
  const [engRow] = await tx
    .select({ engagementId: payments.serviceEngagementId })
    .from(payments)
    .where(eq(payments.proFormaInvoiceId, pf.id))
    .limit(1);
  if (!engRow) {
    throw new BusinessRuleError(
      'PROFORMA_NO_ENGAGEMENT',
      'Cannot issue an invoice: no service engagement exists for this pro forma. Record a payment first.',
    );
  }
  const serviceEngagementId = engRow.engagementId;

  // 4. Recompute totals server-side from line_items (never trust the
  //    header's cached subtotal).
  const lineCents = pfLines.map((l) => moneyToCents(l.lineSubtotal));
  const subtotalCents = sumCents(lineCents);

  // 5. Allocate the INV number. Pro-forma issuance is non-VAT:
  //    vatTreatment=OUTSIDE_SCOPE, taxAmount=0, totalAmount=subtotal.
  const now = new Date();
  const number = await allocateNextNumber(tx, 'INV', now.getUTCFullYear());

  // 6. Pick legacy single-line fields: first line's service / qty / unit
  //    price feed the Stage 1 printable + aging report. Description is
  //    the first-line description + "+ N more" if there are extras.
  const firstLine = pfLines[0];
  if (!firstLine) throw new Error('unreachable: pfLines length guarded above');
  const extraLines = pfLines.length - 1;
  const legacyDescription =
    extraLines > 0
      ? `${firstLine.description} (+ ${extraLines} more line${extraLines === 1 ? '' : 's'})`
      : firstLine.description;
  // Legacy qty is INTEGER NOT NULL — ceil the first line's quantity so
  // the INSERT doesn't violate the type. The real quantities live in
  // invoice_line_items.
  const legacyQty = Math.max(1, Math.ceil(Number.parseFloat(firstLine.quantity)));
  const legacyUnitPrice = firstLine.unitPrice;

  // 7. Insert the invoice header.
  const [invoice] = await tx
    .insert(invoices)
    .values({
      number,
      payerPersonId: pf.payerPersonId,
      serviceEngagementId,
      qty: legacyQty,
      unitPrice: legacyUnitPrice,
      subtotal: centsToMoney(subtotalCents),
      taxAmount: '0.00',
      totalAmount: centsToMoney(subtotalCents),
      currencyCode: pf.currencyCode,
      lineDescription: legacyDescription,
      issuedByUserId: args.issuedByUserId,
      status: 'ISSUED',
      vatTreatment: 'OUTSIDE_SCOPE',
      sourceLeadId: pf.sourceLeadId,
    })
    .returning();
  if (!invoice) throw new Error('invoices insert returned no row');

  // 8. Insert the full line items — the canonical multi-line record.
  await tx.insert(invoiceLineItems).values(
    pfLines.map((l) => ({
      invoiceId: invoice.id,
      serviceCatalogItemId: l.serviceCatalogItemId,
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineSubtotal: l.lineSubtotal,
      sortOrder: l.sortOrder,
    })),
  );

  // 9. Link + idempotency row. The triple UNIQUE on
  //    (pro_forma_invoice_id, purpose, issuance_key) is the DB backstop.
  //    A concurrent issue path that beats us will fail here; our caller
  //    (verifyPaymentForProForma) treats that as RACED and retries via
  //    the idempotent pre-check above.
  await tx.insert(proFormaOfficialInvoices).values({
    proFormaInvoiceId: pf.id,
    invoiceId: invoice.id,
    purpose: args.purpose,
    issuanceKey: args.issuanceKey,
    issuedByUserId: args.issuedByUserId,
  });

  // 10. Flip the pro forma to CONVERTED. Also advance the engagement.
  await tx
    .update(proFormaInvoices)
    .set({ status: 'CONVERTED', updatedAt: now })
    .where(and(eq(proFormaInvoices.id, pf.id), eq(proFormaInvoices.status, 'ACCEPTED')));
  // Engagement promoted to ACTIVE now that the invoice carries the
  // commercial agreement. Idempotent — subsequent calls no-op.
  await tx.execute(sql`
    UPDATE service_engagements
    SET status = 'ACTIVE', updated_at = NOW()
    WHERE id = ${serviceEngagementId} AND status = 'PENDING_PAYMENT'
  `);

  // 11. Shadow-emit the ledger event (same shape as insertInvoice does
  //     for other flows; the outbox-drain cron turns it into a journal).
  await emitFinancialEvent(tx, {
    eventType: 'INVOICE_POSTED',
    sourceSystem: 'ireland_careers',
    sourceModule: 'proformas',
    sourceEntity: 'invoice',
    sourceId: invoice.id,
    sourceEventId: invoice.id,
    eventDate: now,
    payload: {
      actorUserId: args.issuedByUserId,
      invoiceNumber: invoice.number,
      divisionCode: resolveDivisionForInvoice({
        immigrationCaseId: null,
        jobRequisitionId: null,
        placementId: null,
      }),
      currencyCode: pf.currencyCode,
      subtotal: centsToMoney(subtotalCents),
      taxAmount: '0.00',
      total: centsToMoney(subtotalCents),
      description: `Invoice ${invoice.number} (pro forma ${pf.number})`,
    },
  });

  // 12. Audit the issuance itself (CONVERTED gets audited by the caller;
  //     here we capture the invoice side so an inspector can trace from
  //     either side of the join).
  await recordAudit(tx, {
    actorUserId: args.issuedByUserId,
    entityType: 'invoice',
    entityId: invoice.id,
    action: 'ISSUED_FROM_PRO_FORMA',
    after: {
      invoiceNumber: invoice.number,
      proFormaNumber: pf.number,
      total: centsToMoney(subtotalCents),
      currencyCode: pf.currencyCode,
      lineCount: pfLines.length,
    },
  });

  return invoice;
}
