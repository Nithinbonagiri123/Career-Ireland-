import { and, eq, inArray, sql } from 'drizzle-orm';
import { type DbExecutor, recordAudit } from '@/lib/audit/withAudit';
import { requirePermission } from '@/lib/auth/session';
import { todayInDublin } from '@/lib/dates';
import { db } from '@/lib/db/client';
import { currencies } from '@/lib/db/schema/currencies';
import { type Offer, offers } from '@/lib/db/schema/interviews_offers';
import { jobApplications } from '@/lib/db/schema/recruitment';
import { BusinessRuleError, NotFoundError, ValidationError } from '@/lib/errors';
import {
  APPLICATION_TRANSITIONS,
  assertTransition,
  OFFER_TRANSITIONS,
  OPEN_OFFER_STATUSES,
} from '@/lib/state-machine';
import { assertRequisitionOpen, lockRequisitionApplication } from '@/modules/applications/locks';
import {
  type CreateOfferInput,
  CreateOfferSchema,
  type TransitionOfferInput,
  TransitionOfferSchema,
  type UpdateOfferInput,
  UpdateOfferSchema,
} from './schemas';

/**
 * R3 — offers on a job requirement's applications.
 *
 * Uses the accepted OFFER_TRANSITIONS state machine. "SENT" only RECORDS
 * that staff sent the offer themselves — the CRM does not deliver offers,
 * and nothing here claims an email was sent. Accepting an offer records the
 * candidate's answer only: placement stays a separate step through R0's
 * guarded markApplicationPlaced (capacity, duplicate and employer checks),
 * and no invoice or payment is ever touched here.
 *
 * Authorization: the existing `recruitment.interviews` permission (the
 * Interviews & Offers surface). Every write locks the application row, so
 * one open offer per application holds under concurrency.
 */

function fail(label: string, fields: unknown): never {
  throw new ValidationError(label, fields as Record<string, string>);
}

type Terms = ReturnType<typeof CreateOfferSchema.parse>;

async function validateTerms(tx: DbExecutor, d: Omit<Terms, 'applicationId'>): Promise<void> {
  const [cur] = await tx
    .select({ code: currencies.code, isActive: currencies.isActive })
    .from(currencies)
    .where(eq(currencies.code, d.currencyCode))
    .limit(1);
  if (!cur?.isActive) {
    fail('Unknown or inactive currency', { currencyCode: 'Choose an active currency' });
  }
  const today = todayInDublin();
  if (d.expiresOn && d.expiresOn < today) {
    fail('The response date is in the past', { expiresOn: 'Pick today or a later date' });
  }
  if (d.startDate && d.startDate < today) {
    fail('The proposed start date is in the past', { startDate: 'Pick today or a later date' });
  }
}

async function lockOffer(tx: DbExecutor, offerId: string) {
  const [row] = await tx
    .select({ applicationId: offers.jobApplicationId })
    .from(offers)
    .where(eq(offers.id, offerId))
    .limit(1);
  if (!row) throw new NotFoundError('Offer');
  const app = await lockRequisitionApplication(tx, row.applicationId);
  const [offer] = await tx
    .select()
    .from(offers)
    .where(eq(offers.id, offerId))
    .for('update')
    .limit(1);
  if (!offer) throw new NotFoundError('Offer');
  return { offer, app };
}

function snapshot(o: Offer) {
  return {
    status: o.status,
    amount: o.amount,
    currencyCode: o.currencyCode,
    period: o.period,
    startDate: o.startDate,
    expiresOn: o.expiresOn,
  };
}

export async function createOffer(input: CreateOfferInput): Promise<Offer> {
  const session = await requirePermission('recruitment', 'interviews', 'create');
  const r = CreateOfferSchema.safeParse(input);
  if (!r.success) fail('Invalid offer', r.error.flatten().fieldErrors);
  const d = r.data;

  return db.transaction(async (tx) => {
    const app = await lockRequisitionApplication(tx, d.applicationId);
    assertRequisitionOpen(app.requisitionStatus);
    if (app.status !== 'INTERVIEW' && app.status !== 'OFFER') {
      throw new BusinessRuleError(
        'APPLICATION_NOT_AT_OFFER_STAGE',
        'Offers can be made once the candidate has reached the Interview stage.',
      );
    }
    const blocking = await tx
      .select({ id: offers.id, status: offers.status })
      .from(offers)
      .where(
        and(
          eq(offers.jobApplicationId, app.id),
          inArray(offers.status, [...OPEN_OFFER_STATUSES, 'ACCEPTED']),
        ),
      );
    if (blocking.some((o) => o.status === 'ACCEPTED')) {
      throw new BusinessRuleError(
        'OFFER_ALREADY_ACCEPTED',
        'This candidate has already accepted an offer for this job.',
      );
    }
    if (blocking.length > 0) {
      throw new BusinessRuleError(
        'OFFER_ALREADY_OPEN',
        'This candidate already has an open offer for this job — edit or close it first.',
      );
    }
    await validateTerms(tx, d);

    if (app.status === 'INTERVIEW') {
      assertTransition('application', app.status, 'OFFER', APPLICATION_TRANSITIONS);
      await tx
        .update(jobApplications)
        .set({ status: 'OFFER', updatedAt: sql`NOW()` })
        .where(eq(jobApplications.id, app.id));
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'job_application',
        entityId: app.id,
        action: 'STATUS_CHANGED',
        before: { status: app.status },
        after: { status: 'OFFER' },
        context: { via: 'offer_created' },
      });
    }

    const [created] = await tx
      .insert(offers)
      .values({
        jobApplicationId: app.id,
        amount: d.amount,
        currencyCode: d.currencyCode,
        period: d.period,
        startDate: d.startDate ?? null,
        expiresOn: d.expiresOn ?? null,
        terms: d.terms ?? null,
        notes: d.notes ?? null,
        status: 'DRAFT',
        createdByUserId: session.user.id,
      })
      .returning();
    if (!created) throw new Error('offer insert returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'offer',
      entityId: created.id,
      action: 'CREATED',
      after: snapshot(created),
      context: {
        applicationId: app.id,
        jobRequisitionId: app.jobRequisitionId,
        employerId: app.employerId,
        personId: app.personId,
      },
    });
    return created;
  });
}

export async function updateOffer(input: UpdateOfferInput): Promise<Offer> {
  const session = await requirePermission('recruitment', 'interviews', 'edit');
  const r = UpdateOfferSchema.safeParse(input);
  if (!r.success) fail('Invalid offer', r.error.flatten().fieldErrors);
  const d = r.data;
  return db.transaction(async (tx) => {
    const { offer: before } = await lockOffer(tx, d.offerId);
    if (before.status !== 'DRAFT' && before.status !== 'NEGOTIATING') {
      throw new BusinessRuleError(
        'OFFER_NOT_EDITABLE',
        'Only draft offers and offers under negotiation can be edited.',
      );
    }
    await validateTerms(tx, d);
    const [after] = await tx
      .update(offers)
      .set({
        amount: d.amount,
        currencyCode: d.currencyCode,
        period: d.period,
        startDate: d.startDate ?? null,
        expiresOn: d.expiresOn ?? null,
        terms: d.terms ?? null,
        notes: d.notes ?? null,
        updatedAt: sql`NOW()`,
      })
      .where(eq(offers.id, before.id))
      .returning();
    if (!after) throw new Error('offer update returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'offer',
      entityId: after.id,
      action: 'UPDATED',
      before: snapshot(before),
      after: snapshot(after),
    });
    return after;
  });
}

export async function transitionOffer(input: TransitionOfferInput): Promise<Offer> {
  const session = await requirePermission('recruitment', 'interviews', 'edit');
  const r = TransitionOfferSchema.safeParse(input);
  if (!r.success) fail('Invalid offer change', r.error.flatten().fieldErrors);
  const d = r.data;
  return db.transaction(async (tx) => {
    const { offer: before, app } = await lockOffer(tx, d.offerId);
    if (before.status === d.to) {
      throw new BusinessRuleError(
        'INVALID_STATE_TRANSITION',
        `This offer is already ${d.to.toLowerCase()}.`,
      );
    }
    assertTransition('offer', before.status, d.to, OFFER_TRANSITIONS);
    if (d.to === 'ACCEPTED' && app.status !== 'OFFER') {
      throw new BusinessRuleError(
        'APPLICATION_NOT_AT_OFFER_STAGE',
        `The application is ${app.status.replace(/_/g, ' ').toLowerCase()}, so the offer can't be accepted.`,
      );
    }
    const now = new Date();
    const [after] = await tx
      .update(offers)
      .set({
        status: d.to,
        // "SENT" records the staff member's own send; no delivery claimed.
        sentAt: d.to === 'SENT' ? now : before.sentAt,
        respondedAt:
          d.to === 'ACCEPTED' || d.to === 'REJECTED' || d.to === 'NEGOTIATING'
            ? now
            : before.respondedAt,
        updatedAt: sql`NOW()`,
      })
      .where(eq(offers.id, before.id))
      .returning();
    if (!after) throw new Error('offer transition returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'offer',
      entityId: after.id,
      action: `STATUS_${d.to}`,
      before: { status: before.status },
      after: { status: after.status },
      context: {
        ...(d.note ? { note: d.note } : {}),
        ...(d.to === 'SENT' ? { recordedBy: 'staff', delivery: 'outside the CRM' } : {}),
      },
    });
    return after;
  });
}
