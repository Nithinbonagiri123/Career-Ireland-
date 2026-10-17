'use server';

import { eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireInternalStaff } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { leads } from '@/lib/db/schema/leads';
import { candidateProfiles, persons } from '@/lib/db/schema/persons';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import { toActionResult } from '@/lib/result';

/**
 * Pure candidate activation — the Stage 6B split.
 *
 * Unlike `acceptLead` (which bundles engagement + invoice + payment +
 * profile creation in one transaction), this writes ONLY the operational
 * entity:
 *   - creates a `candidate_profiles` row for the lead's person if none
 *     exists, auto-assigning the current user as owner and inheriting the
 *     person's primary occupation
 *   - flips the lead to CONVERTED and stamps acceptedAt / acceptedByUserId /
 *     acceptedEntityId
 *
 * It never writes an engagement, invoice, payment, receipt or refund.
 * Billing has its own flow (pro-forma → payment → verification) and is
 * now a separate operator decision. This mirrors Stage 6A decision:
 * "Candidate activation and invoice settlement are separate operations."
 *
 * Idempotent: if the lead is already CONVERTED, the call is a no-op that
 * returns the existing profile id (so a double-click doesn't error out).
 * Candidate-services only — immigration + recruitment keep using
 * `acceptLead` because their operational entity (case / requisition) and
 * its invoice backlink are intertwined.
 */
export async function activateCandidateAction(input: {
  leadId: string;
}): Promise<ReturnType<typeof toActionResult<ActivateResult>>> {
  const result = await toActionResult<ActivateResult>(() => activateCandidate(input));
  if (result.ok) {
    revalidatePath('/leads');
    revalidatePath('/candidates');
    revalidatePath(`/clients/${result.data.personId}`);
  }
  return result;
}

type ActivateResult = {
  personId: string;
  candidateProfileId: string;
  alreadyActivated: boolean;
};

async function activateCandidate(input: { leadId: string }): Promise<ActivateResult> {
  const session = await requireInternalStaff();
  if (!input.leadId || input.leadId.length < 10) {
    throw new ValidationError('leadId is required.', { leadId: 'Required.' });
  }

  return db.transaction(async (tx) => {
    const [lead] = await tx.select().from(leads).where(eq(leads.id, input.leadId)).limit(1);
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

    // Idempotent: if already converted, surface the existing profile.
    if (lead.status === 'CONVERTED' && lead.acceptedEntityId) {
      return {
        personId: lead.personId,
        candidateProfileId: lead.acceptedEntityId,
        alreadyActivated: true,
      };
    }

    // Reuse an existing profile for the person — one person has at most
    // one candidate_profile (unique index on personId).
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
          assignedUserId: session.user.id,
          primaryOccupationId: personRow?.primaryOccupationId ?? null,
        })
        .returning();
      if (!created) throw new Error('candidate_profiles insert returned no row.');
      profileId = created.id;
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'candidate_profile',
        entityId: profileId,
        action: 'CREATED',
        after: {
          personId: lead.personId,
          assignedUserId: session.user.id,
          primaryOccupationId: personRow?.primaryOccupationId ?? null,
        },
        context: {
          via: 'activate_candidate',
          leadId: lead.id,
          note: 'Stage 6B pure activation — no money writes.',
        },
      });
    }

    await tx
      .update(leads)
      .set({
        status: 'CONVERTED',
        acceptedAt: new Date(),
        acceptedByUserId: session.user.id,
        acceptedEntityId: profileId,
        updatedAt: sql`NOW()`,
      })
      .where(eq(leads.id, lead.id));
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'lead',
      entityId: lead.id,
      action: 'CONVERTED',
      before: { status: lead.status },
      after: { status: 'CONVERTED', acceptedEntityId: profileId },
      context: {
        via: 'activate_candidate',
        note: 'Activation independent of billing — invoice settlement tracked separately.',
      },
    });

    return {
      personId: lead.personId,
      candidateProfileId: profileId,
      alreadyActivated: false,
    };
  });
}
