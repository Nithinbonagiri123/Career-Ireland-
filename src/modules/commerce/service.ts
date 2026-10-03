import { eq, sql } from 'drizzle-orm';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireInternalStaff, requireRole } from '@/lib/auth/session';
import type { DateRange } from '@/lib/date-range';
import { db } from '@/lib/db/client';
import { invoices } from '@/lib/db/schema/billing';
import { type Payment, type ServiceEngagement, serviceEngagements } from '@/lib/db/schema/commerce';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import { emitFinancialEvent } from '@/modules/accounting/events';
import { resolveDivisionForInvoice } from '@/modules/accounting/rule-engine';
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

    const status = data.proofReference?.trim() ? 'PROOF_UPLOADED' : 'PENDING';
    const created = await insertPayment(tx, {
      serviceEngagementId: data.serviceEngagementId,
      amount: data.amount,
      currencyCode: data.currencyCode,
      method: data.method,
      proofReference: blankToNull(data.proofReference),
      receivedAt: data.receivedAt ? new Date(data.receivedAt) : null,
      status,
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

    const after = await updatePayment(tx, parsed.paymentId, {
      status: 'VERIFIED',
      verifiedByUserId: session.user.id,
      verifiedAt: new Date(),
      rejectionReason: null,
    });
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'payment',
      entityId: after.id,
      action: 'VERIFIED',
      before: { status: before.status },
      after: { status: after.status },
    });

    // Advance engagement PENDING_PAYMENT → ACTIVE now that funds are confirmed.
    const engagement = await getEngagement(after.serviceEngagementId);
    if (engagement && engagement.status === 'PENDING_PAYMENT') {
      const advanced = await updateEngagement(tx, engagement.id, { status: 'ACTIVE' });
      await recordAudit(tx, {
        actorUserId: session.user.id,
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
    // UNIQUE constraint keeps this idempotent — if a receipt was
    // already issued (shouldn't happen since we early-returned on
    // already-VERIFIED, but defensively) the insert will throw and
    // the transaction rolls back.
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

    // Resolve payer from the invoice if there is one, otherwise from
    // the engagement (both are enforced to have exactly one payer by
    // the xor CHECK constraints).
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
        issuedByUserId: session.user.id,
      });
      await recordAudit(tx, {
        actorUserId: session.user.id,
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
        // actual sum of verified payments minus credit notes. Never
        // blindly sets PAID like the old code did.
        const change = await recomputeInvoiceStatus(tx, issuedInvoice.id);
        if (change.before !== change.after) {
          await recordAudit(tx, {
            actorUserId: session.user.id,
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
    // into DR Bank / CR Accounts Receivable (via the matched rule).
    // Division resolves from the attached invoice if one exists; else
    // defaults to candidate_services via the resolver's fallback. The
    // event's subtotal is the payment amount — no tax split because the
    // tax was already recognised at invoice-posting time.
    await emitFinancialEvent(tx, {
      eventType: 'PAYMENT_RECEIVED',
      sourceSystem: 'ireland_careers',
      sourceModule: 'commerce',
      sourceEntity: 'payment',
      sourceId: after.id,
      sourceEventId: after.id,
      eventDate: after.verifiedAt ?? after.receivedAt ?? new Date(),
      payload: {
        actorUserId: session.user.id,
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
        description: issuedInvoice
          ? `Payment on invoice ${issuedInvoice.id}`
          : `Payment ${after.id}`,
      },
    });

    return after;
  });
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
