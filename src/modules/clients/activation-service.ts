import { eq, sql } from 'drizzle-orm';
import { type DbExecutor, recordAudit } from '@/lib/audit/withAudit';
import { leads } from '@/lib/db/schema/leads';
import { candidateProfiles, persons } from '@/lib/db/schema/persons';
import { BusinessRuleError } from '@/lib/errors';

export type ActivateResult = {
  personId: string;
  candidateProfileId: string;
  alreadyActivated: boolean;
};

/**
 * Stage 6F — tx-only candidate activation primitive. Lives in a plain
 * module (NOT `'use server'`) so it can be called from inside a
 * transaction opened in another service without crossing the server-
 * action boundary.
 *
 * Shared between two callers:
 *   1. Operator-initiated `activateCandidateAction` (activation.ts),
 *      wrapped in a session gate + `db.transaction`.
 *   2. `verifyPaymentForProFormaAs` in modules/proformas/payments.ts,
 *      which calls this when a verified payment completes the pro-forma
 *      total so the invoice issuance + candidate activation land in
 *      the same transaction.
 *
 * Contract (unchanged from the Stage 6B pure activation):
 *   - creates / reuses a candidate_profiles row for the lead's person
 *   - flips the lead to CONVERTED and stamps acceptedAt / acceptedByUserId
 *     / acceptedEntityId
 *   - never writes an engagement, invoice, payment, receipt or refund
 *   - idempotent: already-CONVERTED leads return the existing profile id
 *   - one-person-one-profile: if the person already has a profile from
 *     a previous activation, this reuses it rather than creating a
 *     duplicate (per the product-owner Phase 1 "candidate already active"
 *     invariant)
 *
 * CS-only. Immigration and Recruitment keep using `acceptLead` because
 * their operational entity (case / requisition) is bound to a separate
 * invoice backlink.
 */
export async function activateCandidateInTx(
  tx: DbExecutor,
  args: {
    leadId: string;
    actorUserId: string;
    /**
     * Audit-trail provenance. Lets a reader distinguish operator-
     * initiated activations from the two auto paths (proforma payment
     * verify, direct payment and convert).
     */
    via: 'activate_candidate' | 'proforma_payment_verified' | 'direct_payment_and_convert';
    note?: string;
  },
): Promise<ActivateResult> {
  const [lead] = await tx.select().from(leads).where(eq(leads.id, args.leadId)).limit(1);
  if (!lead) throw new BusinessRuleError('LEAD_NOT_FOUND', 'Lead not found.');
  if (lead.targetBusiness !== 'CANDIDATE_SERVICES') {
    throw new BusinessRuleError(
      'NOT_A_CS_LEAD',
      'Only Candidate Services leads can be activated this way. Use the Convert flow for Immigration or Recruitment leads.',
    );
  }
  if (!lead.personId) {
    throw new BusinessRuleError('LEAD_HAS_NO_PERSON', 'This lead has no person attached.');
  }

  // Idempotent: if the lead is already converted and points at a profile,
  // surface the existing profile. Guards against the double-click +
  // out-of-order race the Stage 6E+1 Direct Payment path also protects.
  if (lead.status === 'CONVERTED' && lead.acceptedEntityId) {
    return {
      personId: lead.personId,
      candidateProfileId: lead.acceptedEntityId,
      alreadyActivated: true,
    };
  }

  const [existingProfile] = await tx
    .select()
    .from(candidateProfiles)
    .where(eq(candidateProfiles.personId, lead.personId))
    .limit(1);

  let profileId: string;
  if (existingProfile) {
    profileId = existingProfile.id;
  } else {
    const [personRow] = await tx
      .select({ primaryOccupationId: persons.primaryOccupationId })
      .from(persons)
      .where(eq(persons.id, lead.personId))
      .limit(1);
    const [created] = await tx
      .insert(candidateProfiles)
      .values({
        personId: lead.personId,
        assignedUserId: args.actorUserId,
        primaryOccupationId: personRow?.primaryOccupationId ?? null,
      })
      .returning();
    if (!created) throw new Error('candidate_profiles insert returned no row.');
    profileId = created.id;
    await recordAudit(tx, {
      actorUserId: args.actorUserId,
      entityType: 'candidate_profile',
      entityId: profileId,
      action: 'CREATED',
      after: {
        personId: lead.personId,
        assignedUserId: args.actorUserId,
        primaryOccupationId: personRow?.primaryOccupationId ?? null,
      },
      context: {
        via: args.via,
        leadId: lead.id,
        note:
          args.note ??
          (args.via === 'proforma_payment_verified'
            ? 'Auto-activated on full verified pro-forma payment.'
            : 'Operator-initiated activation.'),
      },
    });
  }

  await tx
    .update(leads)
    .set({
      status: 'CONVERTED',
      acceptedAt: new Date(),
      acceptedByUserId: args.actorUserId,
      acceptedEntityId: profileId,
      updatedAt: sql`NOW()`,
    })
    .where(eq(leads.id, lead.id));
  await recordAudit(tx, {
    actorUserId: args.actorUserId,
    entityType: 'lead',
    entityId: lead.id,
    action: 'CONVERTED',
    before: { status: lead.status },
    after: { status: 'CONVERTED', acceptedEntityId: profileId },
    context: {
      via: args.via,
      note:
        args.note ??
        (args.via === 'proforma_payment_verified'
          ? 'Converted automatically on full verified pro-forma payment.'
          : 'Operator-initiated conversion.'),
    },
  });

  return {
    personId: lead.personId,
    candidateProfileId: profileId,
    alreadyActivated: false,
  };
}
