import { eq, sql } from 'drizzle-orm';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { type Payment, type ServiceEngagement, serviceEngagements } from '@/lib/db/schema/commerce';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
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

export async function fetchEngagements(): Promise<EngagementListRow[]> {
  await requireRole(['ADMIN', 'STAFF']);
  return listEngagements();
}

export async function fetchPayments() {
  await requireRole(['ADMIN', 'STAFF']);
  return listPayments();
}

export async function createEngagement(input: CreateEngagementInput): Promise<ServiceEngagement> {
  const session = await requireRole(['ADMIN', 'STAFF']);
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
  const session = await requireRole(['ADMIN', 'STAFF']);
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
  const session = await requireRole(['ADMIN', 'STAFF']);
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
  const session = await requireRole(['ADMIN']);
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
    return after;
  });
}

export async function rejectPayment(input: RejectPaymentInput): Promise<Payment> {
  const session = await requireRole(['ADMIN']);
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
  const session = await requireRole(['ADMIN', 'STAFF']);
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
  const session = await requireRole(['ADMIN', 'STAFF']);
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
