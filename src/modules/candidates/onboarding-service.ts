import { and, eq, lte, sql } from 'drizzle-orm';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { payments, serviceEngagements } from '@/lib/db/schema/commerce';
import { currencies } from '@/lib/db/schema/currencies';
import { candidateProfiles, type Person, persons } from '@/lib/db/schema/persons';
import { serviceCatalogItems } from '@/lib/db/schema/services';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import { insertInvoice, insertReceipt, markInvoicePaid } from '@/modules/billing/service';
import {
  type FinaliseDraftInput,
  FinaliseDraftSchema,
  type UpdateDraftNarrativeInput,
  UpdateDraftNarrativeSchema,
  type UpdateDraftPersonInput,
  UpdateDraftPersonSchema,
} from './onboarding-schemas';

const CANDIDATE_ONBOARDING_CODE = 'CANDIDATE_ONBOARDING';
const CANDIDATE_ONBOARDING_NAME = 'Candidate Onboarding';
/** Drafts older than this are cleaned up by the nightly cron. */
export const DRAFT_MAX_AGE_DAYS = 7;

function normaliseEmail(v: string | null | undefined): string | null {
  const s = v?.trim().toLowerCase();
  return s ? s : null;
}
function normalisePhone(v: string | null | undefined): string | null {
  const s = v?.replace(/[^0-9+]/g, '');
  return s ? s : null;
}
function blankToNull(v: string | null | undefined): string | null {
  return v && v.trim().length > 0 ? v : null;
}

/**
 * Create a blank draft `persons` row for a new candidate onboarding form.
 * Returns just the ID so the client can start auto-saving into it.
 */
export async function createDraft(): Promise<{ personId: string }> {
  const session = await requireRole(['ADMIN', 'STAFF']);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(persons)
      .values({
        firstName: 'Draft',
        lastName: 'Candidate',
        isDraft: true,
        draftedByUserId: session.user.id,
        source: 'DIRECT',
      })
      .returning({ id: persons.id });
    if (!row) throw new Error('draft person insert returned no row');

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'person',
      entityId: row.id,
      action: 'DRAFT_CREATED',
      context: { workflow: 'candidate_onboarding' },
    });

    return { personId: row.id };
  });
}

/**
 * Auto-save a subset of the personal / contact fields on a draft person.
 * Silently no-ops if the person isn't a draft anymore (form was finalised
 * in another tab).
 */
export async function updateDraftPerson(input: UpdateDraftPersonInput): Promise<void> {
  await requireRole(['ADMIN', 'STAFF']);
  const parsed = UpdateDraftPersonSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid draft update',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const d = parsed.data;

  const patch: Record<string, unknown> = {};
  if (d.firstName !== undefined) patch.firstName = d.firstName;
  if (d.lastName !== undefined) patch.lastName = d.lastName;
  if (d.dateOfBirth !== undefined) patch.dateOfBirth = d.dateOfBirth ?? null;
  if (d.nationality !== undefined) patch.nationality = d.nationality ?? null;
  if (d.email !== undefined) {
    const trimmed = d.email && d.email.trim() ? d.email.trim() : null;
    patch.email = trimmed;
    patch.normalizedEmail = normaliseEmail(trimmed);
  }
  if (d.phone !== undefined) {
    patch.phone = d.phone ?? null;
    patch.normalizedPhone = normalisePhone(d.phone);
  }
  if (d.currentCity !== undefined) patch.currentCity = d.currentCity ?? null;
  if (d.currentCountry !== undefined) patch.currentCountry = d.currentCountry ?? null;
  if (d.source !== undefined) patch.source = d.source;
  if (d.notes !== undefined) patch.notes = d.notes ?? null;

  if (Object.keys(patch).length === 0) return;
  patch.updatedAt = sql`NOW()`;

  await db
    .update(persons)
    .set(patch)
    .where(and(eq(persons.id, d.personId), eq(persons.isDraft, true)));
}

/**
 * Auto-save the CV summary / cover letter / narrative fields. Stored on
 * the person row until finalise (the candidate profile doesn't exist yet).
 */
export async function updateDraftNarrative(input: UpdateDraftNarrativeInput): Promise<void> {
  await requireRole(['ADMIN', 'STAFF']);
  const parsed = UpdateDraftNarrativeSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid narrative update',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const d = parsed.data;

  const patch: Record<string, unknown> = {};
  // Cover letter + summary are staged in `notes` for MVP — we split them
  // out onto `candidate_profiles.profileSummary` at finalise. Cover letter
  // lives with the payment payload on submit.
  if (d.profileSummary !== undefined) patch.notes = d.profileSummary ?? null;
  if (Object.keys(patch).length === 0) return;
  patch.updatedAt = sql`NOW()`;
  await db
    .update(persons)
    .set(patch)
    .where(and(eq(persons.id, d.personId), eq(persons.isDraft, true)));
}

async function getOrCreateCandidateOnboardingCatalog(
  tx: Parameters<typeof recordAudit>[0],
  defaultCurrencyCode: string,
): Promise<string> {
  const [existing] = await tx
    .select({ id: serviceCatalogItems.id })
    .from(serviceCatalogItems)
    .where(eq(serviceCatalogItems.code, CANDIDATE_ONBOARDING_CODE))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await tx
    .insert(serviceCatalogItems)
    .values({
      code: CANDIDATE_ONBOARDING_CODE,
      name: CANDIDATE_ONBOARDING_NAME,
      defaultCurrencyCode,
      payerType: 'PERSON',
    })
    .returning({ id: serviceCatalogItems.id });
  if (!created) throw new Error('failed to bootstrap CANDIDATE_ONBOARDING catalog item');
  return created.id;
}

export type FinaliseResult = {
  personId: string;
  candidateProfileId: string;
  invoiceNumber: string;
  receiptNumber: string;
};

/**
 * The Big Create button. Wraps everything in a single transaction:
 *  1. Validate the draft row still exists and is still a draft.
 *  2. Validate required identifiers (first + last name).
 *  3. Flip `is_draft` → false on the person.
 *  4. Create the candidate_profile.
 *  5. Bootstrap the CANDIDATE_ONBOARDING catalog item if missing.
 *  6. Create service_engagement (status = ACTIVE, paid up-front).
 *  7. Record the payment (status = VERIFIED — staff has the money).
 *  8. Issue invoice and receipt (row-locked sequence numbers).
 *  9. Mark invoice PAID.
 * 10. Emit 4 audit events tied to the actor.
 * Any failure rolls back the whole thing.
 */
export async function finaliseDraft(input: FinaliseDraftInput): Promise<FinaliseResult> {
  const session = await requireRole(['ADMIN', 'STAFF']);
  const parsed = FinaliseDraftSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid finalise payload',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const d = parsed.data;

  return db.transaction(async (tx) => {
    const [draft] = await tx
      .select()
      .from(persons)
      .where(and(eq(persons.id, d.personId), eq(persons.isDraft, true)))
      .limit(1);
    if (!draft)
      throw new BusinessRuleError(
        'DRAFT_NOT_FOUND',
        'Draft candidate not found or already finalised',
      );

    if (!draft.firstName || draft.firstName === 'Draft' || !draft.lastName) {
      throw new ValidationError('First and last name are required to create a candidate', {
        firstName: 'Required',
        lastName: 'Required',
      });
    }

    const [currencyRow] = await tx
      .select({ code: currencies.code })
      .from(currencies)
      .where(eq(currencies.code, d.payment.currencyCode))
      .limit(1);
    if (!currencyRow) {
      throw new ValidationError('Unknown currency', {
        'payment.currencyCode': `Currency ${d.payment.currencyCode} not configured`,
      });
    }

    // Flip is_draft → false.
    const [finalisedPerson] = await tx
      .update(persons)
      .set({
        isDraft: false,
        draftedByUserId: null,
        updatedAt: sql`NOW()`,
      })
      .where(eq(persons.id, draft.id))
      .returning();
    if (!finalisedPerson) throw new Error('draft finalise update returned no row');

    // Create candidate profile.
    const [profile] = await tx
      .insert(candidateProfiles)
      .values({
        personId: draft.id,
        profileSummary: blankToNull(draft.notes),
        // coverLetter is captured but doesn't have a first-class column —
        // stored in profileSummary if provided, else preserved from notes.
        lifecycleStatus: 'ACTIVE',
        availabilityStatus: 'AVAILABLE',
        assignedUserId: session.user.id,
      })
      .returning({ id: candidateProfiles.id });
    if (!profile) throw new Error('candidate_profiles insert returned no row');

    const catalogItemId = await getOrCreateCandidateOnboardingCatalog(tx, d.payment.currencyCode);

    const [engagement] = await tx
      .insert(serviceEngagements)
      .values({
        serviceCatalogItemId: catalogItemId,
        payerPersonId: draft.id,
        beneficiaryPersonId: draft.id,
        agreedAmount: d.payment.amount,
        currencyCode: d.payment.currencyCode,
        status: 'ACTIVE',
        notes: blankToNull(d.payment.notes),
      })
      .returning({ id: serviceEngagements.id });
    if (!engagement) throw new Error('service_engagements insert returned no row');

    const receivedAt = new Date(`${d.payment.receivedAt}T00:00:00.000Z`);
    const [payment] = await tx
      .insert(payments)
      .values({
        serviceEngagementId: engagement.id,
        amount: d.payment.amount,
        currencyCode: d.payment.currencyCode,
        method: d.payment.method,
        status: 'VERIFIED',
        proofReference: blankToNull(d.payment.proofReference),
        receivedAt,
        verifiedAt: new Date(),
        verifiedByUserId: session.user.id,
      })
      .returning();
    if (!payment) throw new Error('payments insert returned no row');

    // Invoice + receipt.
    const invoice = await insertInvoice(tx, {
      payerPersonId: draft.id,
      serviceEngagementId: engagement.id,
      subtotal: d.payment.amount,
      taxAmount: '0',
      totalAmount: d.payment.amount,
      currencyCode: d.payment.currencyCode,
      lineDescription: `${CANDIDATE_ONBOARDING_NAME} — ${draft.firstName} ${draft.lastName}`,
      issuedByUserId: session.user.id,
    });

    const receipt = await insertReceipt(tx, {
      paymentId: payment.id,
      invoiceId: invoice.id,
      payerPersonId: draft.id,
      amount: d.payment.amount,
      currencyCode: d.payment.currencyCode,
      receivedAt,
      issuedByUserId: session.user.id,
    });

    await markInvoicePaid(tx, invoice.id);

    // Audit trail — one row per business event.
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'candidate_profile',
      entityId: profile.id,
      action: 'CREATED',
      after: { personId: draft.id, via: 'onboarding_form' },
    });
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'payment',
      entityId: payment.id,
      action: 'RECORDED',
      after: {
        amount: payment.amount,
        currencyCode: payment.currencyCode,
        method: payment.method,
      },
      context: { via: 'onboarding_form', engagementId: engagement.id },
    });
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'invoice',
      entityId: invoice.id,
      action: 'ISSUED',
      after: { number: invoice.number, totalAmount: invoice.totalAmount },
      context: { paymentId: payment.id },
    });
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'receipt',
      entityId: receipt.id,
      action: 'ISSUED',
      after: { number: receipt.number, amount: receipt.amount },
      context: { paymentId: payment.id, invoiceId: invoice.id },
    });

    return {
      personId: draft.id,
      candidateProfileId: profile.id,
      invoiceNumber: invoice.number,
      receiptNumber: receipt.number,
    };
  });
}

/**
 * Abandon a draft — hard-deletes the row plus any documents attached to it.
 * Used by the "Discard draft" button and the nightly cleanup cron.
 */
export async function discardDraft(personId: string): Promise<void> {
  const session = await requireRole(['ADMIN', 'STAFF']);
  return db.transaction(async (tx) => {
    const [draft] = await tx
      .select()
      .from(persons)
      .where(and(eq(persons.id, personId), eq(persons.isDraft, true)))
      .limit(1);
    if (!draft)
      throw new BusinessRuleError('DRAFT_NOT_FOUND', 'Draft not found or already finalised');

    await tx.delete(persons).where(eq(persons.id, personId));

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'person',
      entityId: personId,
      action: 'DRAFT_DISCARDED',
      before: { firstName: draft.firstName, lastName: draft.lastName },
      context: { workflow: 'candidate_onboarding', reason: 'staff_discarded' },
    });
  });
}

/**
 * Nightly cron entry point. Deletes drafts older than DRAFT_MAX_AGE_DAYS
 * along with any documents attached to them. Returns how many were culled
 * so the cron job can log the number.
 */
export async function cleanUpStaleDrafts(): Promise<{ deleted: number }> {
  // No requireRole here — this is called by the cron with its own secret.
  const cutoff = new Date(Date.now() - DRAFT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
  return db.transaction(async (tx) => {
    const stale = await tx
      .select({ id: persons.id })
      .from(persons)
      .where(and(eq(persons.isDraft, true), lte(persons.createdAt, cutoff)));
    if (stale.length === 0) return { deleted: 0 };

    const ids = stale.map((r) => r.id);
    for (const id of ids) {
      await tx.delete(persons).where(eq(persons.id, id));
      await recordAudit(tx, {
        actorUserId: null,
        entityType: 'person',
        entityId: id,
        action: 'DRAFT_DISCARDED',
        context: {
          workflow: 'candidate_onboarding',
          reason: 'stale_cleanup',
          maxAgeDays: DRAFT_MAX_AGE_DAYS,
        },
      });
    }
    return { deleted: ids.length };
  });
}

/** Read the current state of a draft to hydrate the form. */
export async function getDraft(personId: string): Promise<Person | null> {
  await requireRole(['ADMIN', 'STAFF']);
  const [row] = await db
    .select()
    .from(persons)
    .where(and(eq(persons.id, personId), eq(persons.isDraft, true)))
    .limit(1);
  return row ?? null;
}
