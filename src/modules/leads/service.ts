import { eq, sql } from 'drizzle-orm';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireInternalStaff } from '@/lib/auth/session';
import type { DateRange } from '@/lib/date-range';
import { db } from '@/lib/db/client';
import { invoices } from '@/lib/db/schema/billing';
import { immigrationCases } from '@/lib/db/schema/immigration';
import { type Lead, leads } from '@/lib/db/schema/leads';
import { candidateProfiles } from '@/lib/db/schema/persons';
import { employers, jobRequisitions } from '@/lib/db/schema/recruitment';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import type { AssignmentScope } from '@/lib/scope';
import { assertTransition, LEAD_TRANSITIONS } from '@/lib/state-machine';
import { insertPerson } from '@/modules/persons/repository';
import { getLead, insertLead, type LeadListRow, listLeads, updateLead } from './repository';
import {
  type AcceptLeadInput,
  AcceptLeadSchema,
  type ArchiveLeadInput,
  ArchiveLeadSchema,
  type ConvertLeadInput,
  ConvertLeadSchema,
  type CreateLeadInput,
  CreateLeadSchema,
  type UnarchiveLeadInput,
  UnarchiveLeadSchema,
  type UpdateLeadStatusInput,
  UpdateLeadStatusSchema,
} from './schemas';

function blankToNull(v: string | undefined | null): string | null {
  return v && v.trim().length > 0 ? v : null;
}

export async function fetchLeads(
  scope?: AssignmentScope,
  createdRange?: DateRange,
): Promise<LeadListRow[]> {
  const session = await requireInternalStaff();
  return listLeads({
    scope: scope ?? 'all',
    currentUserId: session.user.id,
    createdRange,
  });
}

export async function fetchLead(id: string): Promise<Lead | null> {
  await requireInternalStaff();
  return getLead(id);
}

export async function createLead(input: CreateLeadInput): Promise<Lead> {
  const session = await requireInternalStaff();
  const parsed = CreateLeadSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid lead data',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const data = parsed.data;

  return db.transaction(async (tx) => {
    let personId: string | null = null;
    let employerId: string | null = null;

    if (data.mode === 'NEW_PERSON') {
      const p = data.person;
      const created = await insertPerson(tx, {
        firstName: p.firstName.trim(),
        lastName: p.lastName.trim(),
        email: blankToNull(p.email),
        phone: blankToNull(p.phone),
        dateOfBirth: blankToNull(p.dateOfBirth),
        nationality: blankToNull(p.nationality),
        currentCountry: blankToNull(p.currentCountry),
        currentCity: blankToNull(p.currentCity),
        source: p.source,
        notes: blankToNull(p.notes),
      });
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'person',
        entityId: created.id,
        action: 'CREATED',
        after: { firstName: created.firstName, lastName: created.lastName, email: created.email },
        context: { via: 'lead_creation' },
      });
      personId = created.id;
    } else if (data.mode === 'EXISTING_PERSON') {
      personId = data.personId;
    } else if (data.mode === 'NEW_EMPLOYER') {
      const e = data.employer;
      const [created] = await tx
        .insert(employers)
        .values({
          legalName: e.legalName.trim(),
          tradingName: blankToNull(e.tradingName),
          website: blankToNull(e.website),
          industry: blankToNull(e.industry),
          country: blankToNull(e.country),
          city: blankToNull(e.city),
          relationshipStatus: e.relationshipStatus,
          assignedUserId: blankToNull(e.assignedUserId),
          notes: blankToNull(e.notes),
        })
        .returning();
      if (!created) throw new Error('employer insert returned no row');
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'employer',
        entityId: created.id,
        action: 'CREATED',
        after: { legalName: created.legalName },
        context: { via: 'lead_creation' },
      });
      employerId = created.id;
    } else {
      // EXISTING_EMPLOYER
      employerId = data.employerId;
    }

    const lead = await insertLead(tx, {
      targetBusiness: data.targetBusiness,
      personId,
      employerId,
      status: 'NEW',
      serviceOfInterestId: data.serviceOfInterestId,
      assignedUserId: data.assignedUserId,
      notes: blankToNull(data.notes),
    });

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'lead',
      entityId: lead.id,
      action: 'CREATED',
      after: { targetBusiness: lead.targetBusiness, personId, employerId, status: lead.status },
    });

    return lead;
  });
}

export async function updateLeadStatus(input: UpdateLeadStatusInput): Promise<Lead> {
  const session = await requireInternalStaff();
  const parsed = UpdateLeadStatusSchema.parse(input);
  return db.transaction(async (tx) => {
    const before = await getLead(parsed.leadId);
    if (!before) throw new BusinessRuleError('LEAD_NOT_FOUND', 'Lead not found');
    if (before.status === 'CONVERTED') {
      throw new BusinessRuleError(
        'LEAD_ALREADY_CONVERTED',
        'A converted lead cannot change status',
      );
    }
    if (before.status === parsed.status) return before;
    assertTransition('lead', before.status, parsed.status, LEAD_TRANSITIONS);
    const after = await updateLead(tx, parsed.leadId, {
      status: parsed.status,
      notes: parsed.notes ? parsed.notes : before.notes,
    });
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'lead',
      entityId: after.id,
      action: 'STATUS_CHANGED',
      before: { status: before.status },
      after: { status: after.status },
      context: parsed.notes ? { note: parsed.notes } : undefined,
    });
    return after;
  });
}

/**
 * Convert a Lead into an active CandidateProfile.
 *  - MANUAL_OVERRIDE: staff authorises without payment (recorded)
 *  - PAYMENT_VERIFIED: called from Commerce (5.8) once proof is verified
 * If the Person already has a CandidateProfile, we just mark the Lead as CONVERTED
 * (idempotent — merged/returning persons don't get duplicate profiles).
 */
export async function convertLead(input: ConvertLeadInput) {
  const session = await requireInternalStaff();
  const parsed = ConvertLeadSchema.parse(input);

  return db.transaction(async (tx) => {
    const lead = await getLead(parsed.leadId);
    if (!lead) throw new BusinessRuleError('LEAD_NOT_FOUND', 'Lead not found');
    if (lead.status === 'CONVERTED') {
      throw new BusinessRuleError('LEAD_ALREADY_CONVERTED', 'Lead is already converted');
    }
    // convertLead is the classic CS-only 'become a candidate' handoff. A
    // recruitment lead has no person, so this path can't apply — the new
    // acceptLead flow (Phase D) handles all three targets uniformly.
    if (lead.targetBusiness !== 'CANDIDATE_SERVICES' || !lead.personId) {
      throw new BusinessRuleError(
        'WRONG_LEAD_TARGET',
        'convertLead only applies to CANDIDATE_SERVICES leads; use acceptLead for other targets',
      );
    }
    const personId = lead.personId;

    // Check for existing candidate profile on this person
    const [existingProfile] = await tx
      .select()
      .from(candidateProfiles)
      .where(eq(candidateProfiles.personId, personId))
      .limit(1);

    let profileId: string;
    let createdNewProfile = false;
    if (existingProfile) {
      profileId = existingProfile.id;
    } else {
      const [newProfile] = await tx.insert(candidateProfiles).values({ personId }).returning();
      if (!newProfile) throw new Error('candidate_profiles insert returned no row');
      profileId = newProfile.id;
      createdNewProfile = true;

      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'candidate_profile',
        entityId: newProfile.id,
        action: 'CREATED',
        after: { personId },
        context: { via: 'lead_conversion', leadId: lead.id, method: parsed.method },
      });
    }

    const updatedLead = await updateLead(tx, lead.id, {
      status: 'CONVERTED',
      convertedAt: new Date(),
      convertedByUserId: session.user.id,
      conversionMethod: parsed.method,
    });

    const proofId =
      parsed.paymentProofDocumentInstanceId && parsed.paymentProofDocumentInstanceId.length > 0
        ? parsed.paymentProofDocumentInstanceId
        : null;

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'lead',
      entityId: lead.id,
      action: 'CONVERTED',
      before: { status: lead.status },
      after: { status: updatedLead.status, conversionMethod: parsed.method },
      context: {
        reason: parsed.reason,
        method: parsed.method,
        candidateProfileId: profileId,
        createdNewProfile,
        ...(proofId ? { paymentProofDocumentInstanceId: proofId } : {}),
      },
    });

    return { lead: updatedLead, candidateProfileId: profileId, createdNewProfile };
  });
}

/** Soft-archive a lead. List queries filter archived rows out; the record itself is untouched. */
export async function archiveLead(input: ArchiveLeadInput): Promise<Lead> {
  const session = await requireInternalStaff();
  const parsed = ArchiveLeadSchema.parse(input);
  return db.transaction(async (tx) => {
    const before = await getLead(parsed.leadId);
    if (!before) throw new BusinessRuleError('LEAD_NOT_FOUND', 'Lead not found');
    if (before.archivedAt) {
      throw new BusinessRuleError('ALREADY_ARCHIVED', 'Lead is already archived');
    }
    const [after] = await tx
      .update(leads)
      .set({ archivedAt: new Date(), updatedAt: sql`NOW()` })
      .where(eq(leads.id, parsed.leadId))
      .returning();
    if (!after) throw new Error('archive returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'lead',
      entityId: after.id,
      action: 'ARCHIVED',
      before: { archivedAt: null },
      after: { archivedAt: after.archivedAt },
      context: { reason: parsed.reason },
    });
    return after;
  });
}

/** Restore a previously archived lead back to the active list. */
export async function unarchiveLead(input: UnarchiveLeadInput): Promise<Lead> {
  const session = await requireInternalStaff();
  const parsed = UnarchiveLeadSchema.parse(input);
  return db.transaction(async (tx) => {
    const before = await getLead(parsed.leadId);
    if (!before) throw new BusinessRuleError('LEAD_NOT_FOUND', 'Lead not found');
    if (!before.archivedAt) {
      throw new BusinessRuleError('NOT_ARCHIVED', 'Lead is not archived');
    }
    const [after] = await tx
      .update(leads)
      .set({ archivedAt: null, updatedAt: sql`NOW()` })
      .where(eq(leads.id, parsed.leadId))
      .returning();
    if (!after) throw new Error('unarchive returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'lead',
      entityId: after.id,
      action: 'UNARCHIVED',
      before: { archivedAt: before.archivedAt },
      after: { archivedAt: null },
      context: { reason: parsed.reason },
    });
    return after;
  });
}

/**
 * Universal 'Accept lead' — materialises the lead into its target business.
 *
 * Per target:
 *   - CANDIDATE_SERVICES: activates the person's candidate_profile (same
 *     outcome as convertLead — deduped when a profile already exists).
 *   - IMMIGRATION: creates an immigration_cases row (default caseType =
 *     EMPLOYMENT_PERMIT, operator picks the correct one on the case).
 *   - RECRUITMENT: creates a job_requisitions row in DRAFT (recruiter
 *     fills title/positions/occupation next).
 *
 * After creating the target entity every invoice raised on the source
 * lead is back-linked (immigration_case_id / job_requisition_id) so they
 * show up in the target's billing view without a re-generation step.
 *
 * Idempotent: a second call refuses if acceptedAt is already set, so a
 * double-click can't duplicate the target entity.
 */
export async function acceptLead(input: AcceptLeadInput): Promise<{
  lead: Lead;
  targetBusiness: Lead['targetBusiness'];
  entityId: string;
  invoicesLinked: number;
}> {
  const session = await requireInternalStaff();
  const parsed = AcceptLeadSchema.parse(input);

  return db.transaction(async (tx) => {
    const [lead] = await tx.select().from(leads).where(eq(leads.id, parsed.leadId)).limit(1);
    if (!lead) throw new BusinessRuleError('LEAD_NOT_FOUND', 'Lead not found');
    if (lead.acceptedAt) {
      throw new BusinessRuleError(
        'LEAD_ALREADY_ACCEPTED',
        'This lead has already been accepted — see the linked case/requisition/profile',
      );
    }

    let entityId: string;
    let invoiceUpdate: { column: 'immigrationCaseId' | 'jobRequisitionId'; value: string } | null =
      null;

    if (lead.targetBusiness === 'CANDIDATE_SERVICES') {
      if (!lead.personId) throw new Error('CS lead without personId — schema constraint broken');
      const [existingProfile] = await tx
        .select()
        .from(candidateProfiles)
        .where(eq(candidateProfiles.personId, lead.personId))
        .limit(1);
      if (existingProfile) {
        entityId = existingProfile.id;
      } else {
        const [newProfile] = await tx
          .insert(candidateProfiles)
          .values({ personId: lead.personId })
          .returning();
        if (!newProfile) throw new Error('candidate_profiles insert returned no row');
        entityId = newProfile.id;
        await recordAudit(tx, {
          actorUserId: session.user.id,
          entityType: 'candidate_profile',
          entityId: newProfile.id,
          action: 'CREATED',
          after: { personId: lead.personId },
          context: { via: 'lead_accept', leadId: lead.id, reason: parsed.reason },
        });
      }
      // CS invoices are already payer-person-scoped — the profile inherits
      // them through the person's billing history. No back-link needed.
    } else if (lead.targetBusiness === 'IMMIGRATION') {
      if (!lead.personId)
        throw new Error('Immigration lead without personId — schema constraint broken');
      const [newCase] = await tx
        .insert(immigrationCases)
        .values({
          caseType: 'EMPLOYMENT_PERMIT',
          beneficiaryPersonId: lead.personId,
          assignedUserId: lead.assignedUserId,
          notes: lead.notes,
        })
        .returning();
      if (!newCase) throw new Error('immigration_cases insert returned no row');
      entityId = newCase.id;
      invoiceUpdate = { column: 'immigrationCaseId', value: newCase.id };
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'immigration_case',
        entityId: newCase.id,
        action: 'CREATED',
        after: { beneficiaryPersonId: lead.personId },
        context: { via: 'lead_accept', leadId: lead.id, reason: parsed.reason },
      });
    } else if (lead.targetBusiness === 'RECRUITMENT') {
      if (!lead.employerId)
        throw new Error('Recruitment lead without employerId — schema constraint broken');
      const [emp] = await tx
        .select({ legalName: employers.legalName })
        .from(employers)
        .where(eq(employers.id, lead.employerId))
        .limit(1);
      const [newReq] = await tx
        .insert(jobRequisitions)
        .values({
          employerId: lead.employerId,
          title: `New requisition — ${emp?.legalName ?? 'employer'}`,
          status: 'DRAFT',
          assignedUserId: lead.assignedUserId,
        })
        .returning();
      if (!newReq) throw new Error('job_requisitions insert returned no row');
      entityId = newReq.id;
      invoiceUpdate = { column: 'jobRequisitionId', value: newReq.id };
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'job_requisition',
        entityId: newReq.id,
        action: 'CREATED',
        after: { employerId: lead.employerId, title: newReq.title, status: newReq.status },
        context: { via: 'lead_accept', leadId: lead.id, reason: parsed.reason },
      });
    } else {
      throw new BusinessRuleError('UNKNOWN_TARGET', 'Unknown lead target business');
    }

    // Back-link every invoice raised on this lead to the newly-created
    // case / requisition. CS skips this (invoices already flow through
    // the person's billing history).
    let invoicesLinked = 0;
    if (invoiceUpdate) {
      const setPayload =
        invoiceUpdate.column === 'immigrationCaseId'
          ? { immigrationCaseId: invoiceUpdate.value, updatedAt: sql`NOW()` }
          : { jobRequisitionId: invoiceUpdate.value, updatedAt: sql`NOW()` };
      const updated = await tx
        .update(invoices)
        .set(setPayload)
        .where(eq(invoices.sourceLeadId, lead.id))
        .returning({ id: invoices.id });
      invoicesLinked = updated.length;
    }

    // Stamp the acceptance on the lead itself so a repeat click can't
    // create a duplicate case.
    const [updatedLead] = await tx
      .update(leads)
      .set({
        status: 'CONVERTED',
        acceptedAt: new Date(),
        acceptedByUserId: session.user.id,
        acceptedEntityId: entityId,
        updatedAt: sql`NOW()`,
      })
      .where(eq(leads.id, lead.id))
      .returning();
    if (!updatedLead) throw new Error('leads update returned no row');

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'lead',
      entityId: lead.id,
      action: 'ACCEPTED',
      before: { status: lead.status, acceptedAt: lead.acceptedAt },
      after: {
        status: updatedLead.status,
        acceptedAt: updatedLead.acceptedAt,
        acceptedEntityId: entityId,
      },
      context: {
        targetBusiness: lead.targetBusiness,
        reason: parsed.reason,
        invoicesLinked,
      },
    });

    return {
      lead: updatedLead,
      targetBusiness: lead.targetBusiness,
      entityId,
      invoicesLinked,
    };
  });
}
