import { eq, sql } from 'drizzle-orm';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireInternalStaff } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { type Lead, leads } from '@/lib/db/schema/leads';
import { candidateProfiles } from '@/lib/db/schema/persons';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import type { AssignmentScope } from '@/lib/scope';
import { assertTransition, LEAD_TRANSITIONS } from '@/lib/state-machine';
import { insertPerson } from '@/modules/persons/repository';
import { getLead, insertLead, type LeadListRow, listLeads, updateLead } from './repository';
import {
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

export async function fetchLeads(scope?: AssignmentScope): Promise<LeadListRow[]> {
  const session = await requireInternalStaff();
  return listLeads({ scope: scope ?? 'all', currentUserId: session.user.id });
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
    let personId: string;
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
    } else {
      personId = data.personId;
    }

    const lead = await insertLead(tx, {
      personId,
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
      after: { personId, status: lead.status },
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

    // Check for existing candidate profile on this person
    const [existingProfile] = await tx
      .select()
      .from(candidateProfiles)
      .where(eq(candidateProfiles.personId, lead.personId))
      .limit(1);

    let profileId: string;
    let createdNewProfile = false;
    if (existingProfile) {
      profileId = existingProfile.id;
    } else {
      const [newProfile] = await tx
        .insert(candidateProfiles)
        .values({ personId: lead.personId })
        .returning();
      if (!newProfile) throw new Error('candidate_profiles insert returned no row');
      profileId = newProfile.id;
      createdNewProfile = true;

      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'candidate_profile',
        entityId: newProfile.id,
        action: 'CREATED',
        after: { personId: lead.personId },
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
