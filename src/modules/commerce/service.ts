import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireInternalStaff, requireRole } from '@/lib/auth/session';
import type { DateRange } from '@/lib/date-range';
import { db } from '@/lib/db/client';
import { creditNotes, invoices, receipts } from '@/lib/db/schema/billing';
import {
  type Payment,
  payments,
  type ServiceEngagement,
  serviceEngagements,
} from '@/lib/db/schema/commerce';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import { emitFinancialEvent } from '@/modules/accounting/events';
import { resolveDivisionForInvoice } from '@/modules/accounting/rule-engine';
import { OVERDUE_THRESHOLD_DAYS } from '@/modules/billing/aging';
import {
  assertNoOverpayment,
  insertReceipt,
  recomputeInvoiceStatus,
} from '@/modules/billing/service';
import {
  type EngagementListRow,
  getEngagement,
  getPayment,
  insertEngagement,
  insertPayment,
  listEngagements,
  listPayments,
  updateEngagement,
  updatePayment,
} from './repository';
import {
  type ArchiveEngagementInput,
  ArchiveEngagementSchema,
  type CreateEngagementInput,
  CreateEngagementSchema,
  type RecordPaymentInput,
  RecordPaymentSchema,
  type RejectPaymentInput,
  RejectPaymentSchema,
  type UnarchiveEngagementInput,
  UnarchiveEngagementSchema,
  type UpdateEngagementStatusInput,
  UpdateEngagementStatusSchema,
  type VerifyPaymentInput,
  VerifyPaymentSchema,
} from './schemas';

function blankToNull(v: string | undefined | null): string | null {
  return v && v.trim().length > 0 ? v : null;
}

export async function fetchEngagements(createdRange?: DateRange): Promise<EngagementListRow[]> {
  await requireInternalStaff();
  return listEngagements(createdRange);
}

export async function fetchPayments(createdRange?: DateRange) {
  await requireInternalStaff();
  return listPayments(createdRange);
}

export type PaymentsSummary = {
  /** ISSUED + PARTIALLY_PAID invoices whose issuedAt falls in the range,
   *  with per-invoice outstanding balance computed in-DB. */
  outstandingCount: number;
  outstandingByCurrency: Record<string, string>;
  /** Subset of outstanding where issuedAt is older than the overdue
   *  threshold (14 days) — always evaluated against *now*, not range. */
  overdueCount: number;
  overdueByCurrency: Record<string, string>;
  /** Receipts whose receivedAt falls in the range, summed per currency. */
  receivedCount: number;
  receivedByCurrency: Record<string, string>;
};

/**
 * KPI rollup for the Payments page's "This month" / date-filtered view.
 * Outstanding + Overdue walk the invoices table (currency, status,
 * computed-outstanding) grouped by currency so EUR + ZAR never collapse
 * into a dishonest total. Received counts the receipts table — a receipt
 * is only written when a payment is VERIFIED, so this is "money we have".
 */
export async function fetchPaymentsSummary(createdRange?: DateRange): Promise<PaymentsSummary> {
  await requireInternalStaff();
  const now = new Date();
  const overdueThresholdIso = new Date(
    now.getTime() - OVERDUE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Filter clauses — pushed into both queries so the same date range
  // slices both panels symmetrically.
  const invoiceDateConds = [inArray(invoices.status, ['ISSUED', 'PARTIALLY_PAID'])];
  if (createdRange?.from) invoiceDateConds.push(gte(invoices.issuedAt, createdRange.from));
  if (createdRange?.to) invoiceDateConds.push(lte(invoices.issuedAt, createdRange.to));

  const receiptDateConds = [];
  if (createdRange?.from) receiptDateConds.push(gte(receipts.receivedAt, createdRange.from));
  if (createdRange?.to) receiptDateConds.push(lte(receipts.receivedAt, createdRange.to));

  const [invoicingRollup, receivedRows] = await Promise.all([
    // Same shape as the dashboard rollup: per-invoice outstanding balance
    // in cents (int math only, no float), aggregated per currency.
    db
      .select({
        currencyCode: invoices.currencyCode,
        totalCount: sql<number>`COUNT(*)::int`,
        overdueCount: sql<number>`COALESCE(SUM(CASE WHEN ${invoices.issuedAt} < ${overdueThresholdIso}::timestamptz THEN 1 ELSE 0 END), 0)::int`,
        outstandingCents: sql<number>`COALESCE(SUM(
          GREATEST(
            0,
            ROUND(${invoices.totalAmount} * 100)::bigint
              - COALESCE((
                  SELECT SUM(ROUND(${payments.amount} * 100)::bigint)
                  FROM ${payments}
                  WHERE ${payments.serviceEngagementId} = ${invoices.serviceEngagementId}
                    AND ${payments.status} = 'VERIFIED'
                ), 0)
              - COALESCE((
                  SELECT SUM(ROUND(${creditNotes.amount} * 100)::bigint)
                  FROM ${creditNotes}
                  WHERE ${creditNotes.invoiceId} = ${invoices.id}
                ), 0)
          )
        ), 0)::bigint`,
        overdueCents: sql<number>`COALESCE(SUM(
          CASE WHEN ${invoices.issuedAt} < ${overdueThresholdIso}::timestamptz THEN
            GREATEST(
              0,
              ROUND(${invoices.totalAmount} * 100)::bigint
                - COALESCE((
                    SELECT SUM(ROUND(${payments.amount} * 100)::bigint)
                    FROM ${payments}
                    WHERE ${payments.serviceEngagementId} = ${invoices.serviceEngagementId}
                      AND ${payments.status} = 'VERIFIED'
                  ), 0)
                - COALESCE((
                    SELECT SUM(ROUND(${creditNotes.amount} * 100)::bigint)
                    FROM ${creditNotes}
                    WHERE ${creditNotes.invoiceId} = ${invoices.id}
                  ), 0)
            )
          ELSE 0 END
        ), 0)::bigint`,
      })
      .from(invoices)
      .where(and(...invoiceDateConds))
      .groupBy(invoices.currencyCode),
    db
      .select({
        currencyCode: receipts.currencyCode,
        totalCount: sql<number>`COUNT(*)::int`,
        totalCents: sql<number>`COALESCE(SUM(ROUND(${receipts.amount} * 100)::bigint), 0)::bigint`,
      })
      .from(receipts)
      .where(receiptDateConds.length > 0 ? and(...receiptDateConds) : undefined)
      .groupBy(receipts.currencyCode),
  ]);

  let outstandingCount = 0;
  let overdueCount = 0;
  const outstandingByCurrency: Record<string, string> = {};
  const overdueByCurrency: Record<string, string> = {};
  for (const row of invoicingRollup) {
    outstandingCount += row.totalCount;
    overdueCount += row.overdueCount;
    const out = Number(row.outstandingCents);
    if (out > 0) outstandingByCurrency[row.currencyCode] = (out / 100).toFixed(2);
    const ovd = Number(row.overdueCents);
    if (ovd > 0) overdueByCurrency[row.currencyCode] = (ovd / 100).toFixed(2);
  }

  let receivedCount = 0;
  const receivedByCurrency: Record<string, string> = {};
  for (const row of receivedRows) {
    receivedCount += row.totalCount;
    const cents = Number(row.totalCents);
    if (cents > 0) receivedByCurrency[row.currencyCode] = (cents / 100).toFixed(2);
  }

  return {
    outstandingCount,
    outstandingByCurrency,
    overdueCount,
    overdueByCurrency,
    receivedCount,
    receivedByCurrency,
  };
}

export async function createEngagement(input: CreateEngagementInput): Promise<ServiceEngagement> {
  const session = await requireInternalStaff();
  const parsed = CreateEngagementSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid engagement',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const data = parsed.data;

  return db.transaction(async (tx) => {
    const created = await insertEngagement(tx, {
      serviceCatalogItemId: data.serviceCatalogItemId,
      servicePackageId: blankToNull(data.servicePackageId) ?? undefined,
      payerPersonId:
        data.payerMode === 'PERSON' ? (blankToNull(data.payerPersonId) ?? undefined) : undefined,
      payerEmployerId:
        data.payerMode === 'EMPLOYER'
          ? (blankToNull(data.payerEmployerId) ?? undefined)
          : undefined,
      beneficiaryPersonId: blankToNull(data.beneficiaryPersonId) ?? undefined,
      agreedAmount: data.agreedAmount,
      currencyCode: data.currencyCode,
      notes: blankToNull(data.notes),
      status: 'PENDING_PAYMENT',
    });
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'service_engagement',
      entityId: created.id,
      action: 'CREATED',
      after: {
        serviceCatalogItemId: created.serviceCatalogItemId,
        amount: created.agreedAmount,
        currency: created.currencyCode,
        status: created.status,
      },
    });
    return created;
  });
}

export async function updateEngagementStatus(
  input: UpdateEngagementStatusInput,
): Promise<ServiceEngagement> {
  const session = await requireInternalStaff();
  const parsed = UpdateEngagementStatusSchema.parse(input);
  return db.transaction(async (tx) => {
    const before = await getEngagement(parsed.engagementId);
    if (!before) throw new BusinessRuleError('ENGAGEMENT_NOT_FOUND', 'Engagement not found');
    if (before.status === parsed.status) return before;
    const after = await updateEngagement(tx, parsed.engagementId, { status: parsed.status });
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'service_engagement',
      entityId: after.id,
      action: 'STATUS_CHANGED',
      before: { status: before.status },
      after: { status: after.status },
      context: parsed.reason ? { reason: parsed.reason } : undefined,
    });
    return after;
  });
}

export async function recordPayment(input: RecordPaymentInput): Promise<Payment> {
  const session = await requireInternalStaff();
  const parsed = RecordPaymentSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid payment',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const data = parsed.data;

  // Fast path: ADMIN + FINANCE record payments after confirming the money
  // in the bank statement, so the two-step record → verify dance is pure
  // friction. When they record, we insert at VERIFIED directly and run
  // the full verification side-effect chain inline (receipt, engagement
  // ACTIVE, invoice recompute, ledger event). Lesser roles still land at
  // PENDING / PROOF_UPLOADED so an ADMIN can review and verify later.
  const canAutoVerify = session.user.role === 'ADMIN' || session.user.role === 'FINANCE';

  return db.transaction(async (tx) => {
    const engagement = await getEngagement(data.serviceEngagementId);
    if (!engagement) {
      throw new BusinessRuleError('ENGAGEMENT_NOT_FOUND', 'Engagement not found');
    }
    if (engagement.status === 'CANCELLED') {
      throw new BusinessRuleError(
        'ENGAGEMENT_CANCELLED',
        'Cannot record payment on a cancelled engagement',
      );
    }

    const initialStatus = data.proofReference?.trim() ? 'PROOF_UPLOADED' : 'PENDING';
    const created = await insertPayment(tx, {
      serviceEngagementId: data.serviceEngagementId,
      amount: data.amount,
      currencyCode: data.currencyCode,
      method: data.method,
      proofReference: blankToNull(data.proofReference),
      receivedAt: data.receivedAt ? new Date(data.receivedAt) : null,
      status: initialStatus,
    });

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'payment',
      entityId: created.id,
      action: 'CREATED',
      after: {
        amount: created.amount,
        currency: created.currencyCode,
        method: created.method,
        status: created.status,
      },
      context: { serviceEngagementId: engagement.id },
    });

    if (canAutoVerify) {
      return performPaymentVerification(tx, created, session.user.id);
    }
    return created;
  });
}

export async function verifyPayment(input: VerifyPaymentInput): Promise<Payment> {
  // Payment verification is the moment cash counts as received. Only
  // ADMIN + FINANCE can flip PENDING → VERIFIED so anyone else on the
  // internal team can't accidentally trip an audit-relevant financial
  // state change.
  const session = await requireRole(['ADMIN', 'FINANCE']);
  const parsed = VerifyPaymentSchema.parse(input);
  return db.transaction(async (tx) => {
    const before = await getPayment(parsed.paymentId);
    if (!before) throw new BusinessRuleError('PAYMENT_NOT_FOUND', 'Payment not found');
    if (before.status === 'VERIFIED') return before;
    if (before.status === 'REJECTED') {
      throw new BusinessRuleError(
        'PAYMENT_REJECTED',
        'Rejected payments cannot be verified — record a new payment instead',
      );
    }
    return performPaymentVerification(tx, before, session.user.id);
  });
}

// Shared verification body — called from `verifyPayment` (admin manually
// confirming a PENDING / PROOF_UPLOADED row), from `recordPayment`'s
// fast-path (ADMIN / FINANCE recording a payment they've already
// confirmed in the bank statement, so the second click is pure friction),
// and from `convertLead` in modules/leads (atomic "convert = record
// payment" flow).
//
// Caller must have already fetched `before` inside `tx` and confirmed
// it's not already VERIFIED or REJECTED.
export async function performPaymentVerification(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  before: Payment,
  actorUserId: string,
): Promise<Payment> {
  // Overpayment guard: if this payment would take the settled amount
  // past the invoice total (existing verified payments + credit notes
  // + this payment), refuse. Prevents accidental double-verification
  // when staff record the same bank line twice.
  const [invoiceOnEngagement] = await tx
    .select({ id: invoices.id })
    .from(invoices)
    .where(eq(invoices.serviceEngagementId, before.serviceEngagementId))
    .limit(1);
  if (invoiceOnEngagement) {
    const additional = Math.round(Number.parseFloat(before.amount) * 100);
    await assertNoOverpayment(tx, invoiceOnEngagement.id, additional);
  }

  const after = await updatePayment(tx, before.id, {
    status: 'VERIFIED',
    verifiedByUserId: actorUserId,
    verifiedAt: new Date(),
    rejectionReason: null,
  });
  await recordAudit(tx, {
    actorUserId,
    entityType: 'payment',
    entityId: after.id,
    action: 'VERIFIED',
    before: { status: before.status },
    after: { status: after.status },
  });

  // Advance engagement PENDING_PAYMENT → ACTIVE now that funds are confirmed.
  // Pass `tx` so this reads uncommitted writes from the same transaction —
  // critical for the acceptLead path where the engagement was inserted
  // moments ago inside this same tx.
  const engagement = await getEngagement(after.serviceEngagementId, tx);
  if (engagement && engagement.status === 'PENDING_PAYMENT') {
    const advanced = await updateEngagement(tx, engagement.id, { status: 'ACTIVE' });
    await recordAudit(tx, {
      actorUserId,
      entityType: 'service_engagement',
      entityId: advanced.id,
      action: 'STATUS_CHANGED',
      before: { status: engagement.status },
      after: { status: advanced.status },
      context: { via: 'payment_verified', paymentId: after.id },
    });
  }

  // Auto-issue a receipt so every VERIFIED payment leaves a
  // printable trail without the operator having to remember. If an
  // invoice is attached to the engagement, we also link the receipt
  // to it and flip the invoice to PAID. The `receipts.payment_id`
  // UNIQUE constraint keeps this idempotent.
  const [issuedInvoice] = await tx
    .select({
      id: invoices.id,
      payerPersonId: invoices.payerPersonId,
      payerEmployerId: invoices.payerEmployerId,
      currencyCode: invoices.currencyCode,
      // Back-link columns so the shadow-ledger emit below can resolve
      // the correct division — a payment belongs to whichever
      // workspace raised the invoice it settles.
      immigrationCaseId: invoices.immigrationCaseId,
      jobRequisitionId: invoices.jobRequisitionId,
      placementId: invoices.placementId,
    })
    .from(invoices)
    .where(eq(invoices.serviceEngagementId, after.serviceEngagementId))
    .limit(1);

  const payerPersonId = issuedInvoice?.payerPersonId ?? engagement?.payerPersonId ?? null;
  const payerEmployerId = issuedInvoice?.payerEmployerId ?? engagement?.payerEmployerId ?? null;

  if (payerPersonId || payerEmployerId) {
    const receipt = await insertReceipt(tx, {
      paymentId: after.id,
      invoiceId: issuedInvoice?.id ?? null,
      payerPersonId,
      payerEmployerId,
      amount: after.amount,
      currencyCode: after.currencyCode,
      receivedAt: after.receivedAt ?? after.verifiedAt ?? new Date(),
      issuedByUserId: actorUserId,
    });
    await recordAudit(tx, {
      actorUserId,
      entityType: 'receipt',
      entityId: receipt.id,
      action: 'CREATED',
      after: {
        number: receipt.number,
        paymentId: after.id,
        invoiceId: issuedInvoice?.id ?? null,
        via: 'payment_verified',
      },
    });

    if (issuedInvoice) {
      // Recompute — flips ISSUED → PARTIALLY_PAID → PAID based on the
      // actual sum of verified payments minus credit notes.
      const change = await recomputeInvoiceStatus(tx, issuedInvoice.id);
      if (change.before !== change.after) {
        await recordAudit(tx, {
          actorUserId,
          entityType: 'invoice',
          entityId: issuedInvoice.id,
          action: 'STATUS_CHANGED',
          before: { status: change.before },
          after: { status: change.after },
          context: {
            via: 'payment_verified',
            paymentId: after.id,
            paidCents: change.paidCents,
            totalCents: change.totalCents,
          },
        });
      }
    }
  }

  // Shadow-record the payment in the ledger. A VERIFIED payment is
  // the moment cash counts as received; the rule engine turns this
  // into DR Bank / CR Accounts Receivable.
  await emitFinancialEvent(tx, {
    eventType: 'PAYMENT_RECEIVED',
    sourceSystem: 'ireland_careers',
    sourceModule: 'commerce',
    sourceEntity: 'payment',
    sourceId: after.id,
    sourceEventId: after.id,
    eventDate: after.verifiedAt ?? after.receivedAt ?? new Date(),
    payload: {
      actorUserId,
      paymentId: after.id,
      invoiceId: issuedInvoice?.id ?? null,
      divisionCode: resolveDivisionForInvoice({
        immigrationCaseId: issuedInvoice?.immigrationCaseId,
        jobRequisitionId: issuedInvoice?.jobRequisitionId,
        placementId: issuedInvoice?.placementId,
      }),
      currencyCode: after.currencyCode,
      subtotal: after.amount,
      taxAmount: '0',
      total: after.amount,
      description: issuedInvoice ? `Payment on invoice ${issuedInvoice.id}` : `Payment ${after.id}`,
    },
  });

  return after;
}

export async function rejectPayment(input: RejectPaymentInput): Promise<Payment> {
  // Same gating as verifyPayment — rejecting a payment is also a
  // financial state change with audit consequences.
  const session = await requireRole(['ADMIN', 'FINANCE']);
  const parsed = RejectPaymentSchema.parse(input);
  return db.transaction(async (tx) => {
    const before = await getPayment(parsed.paymentId);
    if (!before) throw new BusinessRuleError('PAYMENT_NOT_FOUND', 'Payment not found');
    if (before.status === 'VERIFIED') {
      throw new BusinessRuleError(
        'PAYMENT_ALREADY_VERIFIED',
        'Cannot reject a verified payment — issue a refund/adjustment record instead',
      );
    }
    const after = await updatePayment(tx, parsed.paymentId, {
      status: 'REJECTED',
      rejectionReason: parsed.reason,
    });
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'payment',
      entityId: after.id,
      action: 'REJECTED',
      before: { status: before.status },
      after: { status: after.status },
      context: { reason: parsed.reason },
    });
    return after;
  });
}

// ─── Engagement archive / unarchive ───────────────────────────────────────────

export async function archiveEngagement(input: ArchiveEngagementInput): Promise<ServiceEngagement> {
  const session = await requireInternalStaff();
  const parsed = ArchiveEngagementSchema.parse(input);
  return db.transaction(async (tx) => {
    const before = await getEngagement(parsed.engagementId);
    if (!before) throw new BusinessRuleError('ENGAGEMENT_NOT_FOUND', 'Engagement not found');
    if (before.archivedAt) {
      throw new BusinessRuleError('ALREADY_ARCHIVED', 'Engagement is already archived');
    }
    const [after] = await tx
      .update(serviceEngagements)
      .set({
        archivedAt: new Date(),
        archivedByUserId: session.user.id,
        updatedAt: sql`NOW()`,
      })
      .where(eq(serviceEngagements.id, parsed.engagementId))
      .returning();
    if (!after) throw new Error('archive returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'service_engagement',
      entityId: after.id,
      action: 'ARCHIVED',
      before: { archivedAt: null },
      after: { archivedAt: after.archivedAt },
      context: { reason: parsed.reason },
    });
    return after;
  });
}

export async function unarchiveEngagement(
  input: UnarchiveEngagementInput,
): Promise<ServiceEngagement> {
  const session = await requireInternalStaff();
  const parsed = UnarchiveEngagementSchema.parse(input);
  return db.transaction(async (tx) => {
    const before = await getEngagement(parsed.engagementId);
    if (!before) throw new BusinessRuleError('ENGAGEMENT_NOT_FOUND', 'Engagement not found');
    if (!before.archivedAt) {
      throw new BusinessRuleError('NOT_ARCHIVED', 'Engagement is not archived');
    }
    const [after] = await tx
      .update(serviceEngagements)
      .set({ archivedAt: null, archivedByUserId: null, updatedAt: sql`NOW()` })
      .where(eq(serviceEngagements.id, parsed.engagementId))
      .returning();
    if (!after) throw new Error('unarchive returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'service_engagement',
      entityId: after.id,
      action: 'UNARCHIVED',
      before: { archivedAt: before.archivedAt },
      after: { archivedAt: null },
      context: { reason: parsed.reason },
    });
    return after;
  });
}
