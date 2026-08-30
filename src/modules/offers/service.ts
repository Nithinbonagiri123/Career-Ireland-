import { desc, eq, sql } from 'drizzle-orm';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { type Offer, offers } from '@/lib/db/schema/interviews_offers';
import { jobApplications } from '@/lib/db/schema/recruitment';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import { assertTransition, OFFER_TRANSITIONS } from '@/lib/state-machine';
import { updateApplicationStatus } from '@/modules/applications/service';
import {
  type CreateOfferInput,
  CreateOfferSchema,
  type RemoveOfferInput,
  RemoveOfferSchema,
  type UpdateOfferInput,
  UpdateOfferSchema,
  type UpdateOfferStatusInput,
  UpdateOfferStatusSchema,
} from './schemas';

function blankToNull(v: string | undefined | null): string | null {
  return v && v.trim().length > 0 ? v : null;
}

export async function listOffersForApplication(jobApplicationId: string): Promise<Offer[]> {
  await requireRole(['ADMIN', 'STAFF']);
  return db
    .select()
    .from(offers)
    .where(eq(offers.jobApplicationId, jobApplicationId))
    .orderBy(desc(offers.createdAt));
}

export async function createOffer(input: CreateOfferInput): Promise<Offer> {
  const session = await requireRole(['ADMIN', 'STAFF']);
  const parsed = CreateOfferSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid offer',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const d = parsed.data;
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(offers)
      .values({
        jobApplicationId: d.jobApplicationId,
        amount: d.amount,
        currencyCode: d.currencyCode,
        period: d.period,
        startDate: blankToNull(d.startDate ?? undefined),
        expiresOn: blankToNull(d.expiresOn ?? undefined),
        terms: blankToNull(d.terms ?? undefined),
        notes: blankToNull(d.notes ?? undefined),
        status: 'DRAFT',
        createdByUserId: session.user.id,
      })
      .returning();
    if (!row) throw new Error('insert returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'offer',
      entityId: row.id,
      action: 'CREATED',
      after: {
        jobApplicationId: row.jobApplicationId,
        amount: row.amount,
        currencyCode: row.currencyCode,
        status: row.status,
      },
    });
    return row;
  });
}

export async function updateOffer(input: UpdateOfferInput): Promise<Offer> {
  const session = await requireRole(['ADMIN', 'STAFF']);
  const parsed = UpdateOfferSchema.parse(input);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(offers).where(eq(offers.id, parsed.id)).limit(1);
    if (!before) throw new BusinessRuleError('OFFER_NOT_FOUND', 'Offer not found');
    if (before.status !== 'DRAFT' && before.status !== 'NEGOTIATING') {
      throw new BusinessRuleError(
        'OFFER_LOCKED',
        `Offer in status ${before.status} cannot be edited — create a new offer to renegotiate`,
      );
    }
    const [after] = await tx
      .update(offers)
      .set({
        amount: parsed.amount,
        currencyCode: parsed.currencyCode,
        period: parsed.period,
        startDate: blankToNull(parsed.startDate ?? undefined),
        expiresOn: blankToNull(parsed.expiresOn ?? undefined),
        terms: blankToNull(parsed.terms ?? undefined),
        notes: blankToNull(parsed.notes ?? undefined),
        updatedAt: sql`NOW()`,
      })
      .where(eq(offers.id, parsed.id))
      .returning();
    if (!after) throw new Error('update returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'offer',
      entityId: after.id,
      action: 'UPDATED',
      before: { amount: before.amount, currencyCode: before.currencyCode },
      after: { amount: after.amount, currencyCode: after.currencyCode },
    });
    return after;
  });
}

/**
 * Move an offer between statuses (DRAFT → SENT → ACCEPTED etc.). Also records
 * `sent_at` / `responded_at` timestamps automatically and, on ACCEPTED, cascades
 * to move the associated application to ACCEPTED (which itself triggers auto-placement).
 */
export async function updateOfferStatus(input: UpdateOfferStatusInput): Promise<Offer> {
  const session = await requireRole(['ADMIN', 'STAFF']);
  const parsed = UpdateOfferStatusSchema.parse(input);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(offers).where(eq(offers.id, parsed.id)).limit(1);
    if (!before) throw new BusinessRuleError('OFFER_NOT_FOUND', 'Offer not found');
    if (before.status === parsed.status) return before;
    assertTransition('offer', before.status, parsed.status, OFFER_TRANSITIONS);

    const now = new Date();
    const [after] = await tx
      .update(offers)
      .set({
        status: parsed.status,
        sentAt: parsed.status === 'SENT' && !before.sentAt ? now : before.sentAt,
        respondedAt:
          (parsed.status === 'ACCEPTED' ||
            parsed.status === 'REJECTED' ||
            parsed.status === 'WITHDRAWN') &&
          !before.respondedAt
            ? now
            : before.respondedAt,
        notes: blankToNull(parsed.notes ?? undefined) ?? before.notes,
        updatedAt: sql`NOW()`,
      })
      .where(eq(offers.id, parsed.id))
      .returning();
    if (!after) throw new Error('update returned no row');

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'offer',
      entityId: after.id,
      action: 'STATUS_CHANGED',
      before: { status: before.status },
      after: { status: after.status },
    });

    // Cascade: accepting an offer bumps the application to ACCEPTED (which itself creates a placement).
    if (parsed.status === 'ACCEPTED') {
      const [app] = await tx
        .select({ status: jobApplications.status })
        .from(jobApplications)
        .where(eq(jobApplications.id, after.jobApplicationId))
        .limit(1);
      if (app && app.status !== 'ACCEPTED') {
        // updateApplicationStatus does its own transaction — call outside tx after commit is safer,
        // but the cascade path is idempotent so nested tx is acceptable here.
        await updateApplicationStatus({
          applicationId: after.jobApplicationId,
          status: 'ACCEPTED',
        });
      }
    }

    return after;
  });
}

export async function removeOffer(input: RemoveOfferInput): Promise<void> {
  const session = await requireRole(['ADMIN', 'STAFF']);
  const parsed = RemoveOfferSchema.parse(input);
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(offers).where(eq(offers.id, parsed.id)).limit(1);
    if (!before) return;
    if (before.status !== 'DRAFT') {
      throw new BusinessRuleError(
        'OFFER_NOT_DRAFT',
        'Only DRAFT offers can be deleted — withdraw a sent offer instead',
      );
    }
    await tx.delete(offers).where(eq(offers.id, parsed.id));
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'offer',
      entityId: before.id,
      action: 'DELETED',
      before: { jobApplicationId: before.jobApplicationId, amount: before.amount },
    });
  });
}
