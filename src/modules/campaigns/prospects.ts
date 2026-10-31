import { and, eq, inArray, isNull, like, ne, or, sql } from 'drizzle-orm';
import { type DbExecutor, recordAudit } from '@/lib/audit/withAudit';
import { requireInternalStaff, requirePermission } from '@/lib/auth/session';
import { todayInDublin } from '@/lib/dates';
import { db } from '@/lib/db/client';
import { tasks } from '@/lib/db/schema/activities';
import {
  advertisements,
  type RecruitmentProspect,
  recruitmentCampaigns,
  recruitmentProspects,
} from '@/lib/db/schema/campaigns';
import { candidateProfiles, persons } from '@/lib/db/schema/persons';
import { jobRequisitions } from '@/lib/db/schema/recruitment';
import { users } from '@/lib/db/schema/users';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import { assertTransition, PROSPECT_TRANSITIONS } from '@/lib/state-machine';
import { BUSINESS_TIMEZONE, formatZoned, zonedLocalToUtc } from '@/lib/zoned-time';
import { manuallyShortlistPerson } from '@/modules/matching/service';
import { insertPerson } from '@/modules/persons/repository';
import {
  type AddProspectNoteInput,
  AddProspectNoteSchema,
  type ConvertProspectInput,
  ConvertProspectSchema,
  type CreateProspectInput,
  CreateProspectSchema,
  type SetProspectFollowUpInput,
  SetProspectFollowUpSchema,
  type UpdateProspectStatusInput,
  UpdateProspectStatusSchema,
} from './schemas';
import {
  followUpMarker,
  type ProspectRow,
  parseOrThrow,
  prospectSelect,
  toProspectRow,
} from './service';

/**
 * R4 — prospect lifecycle. Writes need recruitment.prospects (create /
 * edit). A person can be a prospect once per campaign. Conversion is an
 * explicit, confirmed hand-off: it reuses an existing candidate profile,
 * never creates an application, and only shortlists on the campaign's job
 * when asked (through the existing R2 shortlist path).
 */

function blankToNull(v: string | undefined | null): string | null {
  return v && v.trim().length > 0 ? v.trim() : null;
}

/** Appended note line: "[29 Oct 2026 14:05 Irish time · Mary] text". */
function noteLine(author: string, text: string): string {
  return `[${formatZoned(new Date())} · ${author}] ${text}`;
}

function appendNote(existing: string | null, line: string): string {
  return existing && existing.trim().length > 0 ? `${existing}\n${line}` : line;
}

async function actorName(tx: DbExecutor, userId: string): Promise<string> {
  const [u] = await tx
    .select({ fullName: users.fullName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return u?.fullName ?? 'Staff';
}

async function lockProspect(tx: DbExecutor, id: string) {
  const [row] = await tx
    .select({
      p: recruitmentProspects,
      campaignId: advertisements.campaignId,
      campaignName: recruitmentCampaigns.name,
      campaignJobId: recruitmentCampaigns.jobRequisitionId,
      adCountry: advertisements.country,
      adPlatform: advertisements.platform,
    })
    .from(recruitmentProspects)
    .innerJoin(advertisements, eq(advertisements.id, recruitmentProspects.advertisementId))
    .innerJoin(recruitmentCampaigns, eq(recruitmentCampaigns.id, advertisements.campaignId))
    .where(eq(recruitmentProspects.id, id))
    .for('update', { of: recruitmentProspects })
    .limit(1);
  if (!row) throw new BusinessRuleError('PROSPECT_NOT_FOUND', 'Prospect not found');
  return row;
}

/* ─── Capture ──────────────────────────────────────────────────────── */

export async function createProspect(input: CreateProspectInput): Promise<RecruitmentProspect> {
  const d = parseOrThrow(CreateProspectSchema, input, 'Invalid prospect');
  const session = await requirePermission('recruitment', 'prospects', 'create');

  return db.transaction(async (tx) => {
    const [ad] = await tx
      .select({
        id: advertisements.id,
        campaignId: advertisements.campaignId,
        status: advertisements.status,
      })
      .from(advertisements)
      .where(eq(advertisements.id, d.advertisementId))
      .limit(1);
    if (!ad) throw new BusinessRuleError('AD_NOT_FOUND', 'Advertisement not found');
    // Lock the campaign so two captures of the same person on different
    // ads of this campaign cannot both pass the duplicate check.
    const [campaign] = await tx
      .select()
      .from(recruitmentCampaigns)
      .where(eq(recruitmentCampaigns.id, ad.campaignId))
      .for('update')
      .limit(1);
    if (!campaign) throw new BusinessRuleError('CAMPAIGN_NOT_FOUND', 'Campaign not found');
    if (campaign.archivedAt || campaign.status === 'CANCELLED') {
      throw new BusinessRuleError(
        'CAMPAIGN_ENDED',
        'This campaign is cancelled or archived — prospects can no longer be added',
      );
    }
    if (campaign.status === 'PAUSED') {
      throw new BusinessRuleError(
        'CAMPAIGN_PAUSED',
        'This campaign is paused — new prospects can be recorded again once it is resumed',
      );
    }
    // A prospect is someone who responded to an advert that was live. A
    // draft campaign or a draft (never marked live) advert has had no
    // responses yet (P0 — owner saw prospects logged on drafts).
    if (campaign.status === 'DRAFT') {
      throw new BusinessRuleError(
        'CAMPAIGN_NOT_LIVE',
        'This campaign is still a draft — activate it and mark an advertisement live before recording prospects',
      );
    }
    if (ad.status === 'DRAFT') {
      throw new BusinessRuleError(
        'AD_NOT_LIVE',
        'This advertisement was never marked live — mark it live before recording prospects who responded to it',
      );
    }
    if (ad.status === 'CLOSED') {
      throw new BusinessRuleError('AD_CLOSED', 'This advertisement is closed');
    }
    if (ad.status === 'PAUSED') {
      throw new BusinessRuleError(
        'AD_PAUSED',
        'This advertisement is paused — reactivate it to record new prospects',
      );
    }

    let personId: string;
    let personCreated = false;
    if (d.personId) {
      const [person] = await tx
        .select({
          id: persons.id,
          archivedAt: persons.archivedAt,
          mergedIntoPersonId: persons.mergedIntoPersonId,
        })
        .from(persons)
        .where(eq(persons.id, d.personId))
        .limit(1);
      if (!person) throw new BusinessRuleError('PERSON_NOT_FOUND', 'Person not found');
      if (person.archivedAt || person.mergedIntoPersonId) {
        throw new BusinessRuleError(
          'PERSON_INACTIVE',
          'This person record is archived or merged — use the current record',
        );
      }
      personId = person.id;
    } else {
      const np = d.newPerson;
      if (!np) throw new ValidationError('Enter the new person', { personId: 'Required' });
      // Duplicate check. Compares the raw columns: persons.normalized_email /
      // normalized_phone are not populated for most existing rows, so they
      // cannot be relied on.
      //  - Same email or phone → hard block (it is the same person).
      //  - Same first + last name only → a warning; common names are not
      //    proof, so the user may confirm "This is a different person"
      //    (audited on the new person).
      const nEmail = blankToNull(np.email)?.toLowerCase() ?? null;
      const nPhone = blankToNull(np.phone)?.replace(/[^0-9+]/g, '') || null;
      const active = and(isNull(persons.archivedAt), isNull(persons.mergedIntoPersonId));
      const contactMatches =
        nEmail || nPhone
          ? await tx
              .select({ firstName: persons.firstName, lastName: persons.lastName })
              .from(persons)
              .where(
                and(
                  active,
                  or(
                    nEmail ? sql`lower(trim(${persons.email})) = ${nEmail}` : undefined,
                    nPhone
                      ? sql`regexp_replace(coalesce(${persons.phone}, ''), '[^0-9+]', '', 'g') = ${nPhone}`
                      : undefined,
                  ),
                ),
              )
              .limit(3)
          : [];
      if (contactMatches.length > 0) {
        const names = contactMatches.map((m) => `${m.firstName} ${m.lastName}`).join(', ');
        throw new BusinessRuleError(
          'PROSPECT_POSSIBLE_DUPLICATE',
          `This person may already exist (${names}) — same email or phone. Search for them and pick the existing record.`,
        );
      }
      const nameMatches = await tx
        .select({
          id: persons.id,
          firstName: persons.firstName,
          lastName: persons.lastName,
          email: persons.email,
        })
        .from(persons)
        .where(
          and(
            active,
            sql`lower(trim(${persons.firstName})) = ${np.firstName.trim().toLowerCase()}`,
            sql`lower(trim(${persons.lastName})) = ${np.lastName.trim().toLowerCase()}`,
          ),
        )
        .limit(3);
      if (nameMatches.length > 0 && !d.confirmDifferentPerson) {
        const list = nameMatches
          .map((m) => `${m.firstName} ${m.lastName} (${m.email ?? 'no email'})`)
          .join(', ');
        throw new BusinessRuleError(
          'PROSPECT_NAME_MATCH',
          `Possible match: ${list}. If it is them, switch to “Existing person” and pick the record. If not, tick “This is a different person” and record again.`,
        );
      }
      const created = await insertPerson(tx, {
        firstName: np.firstName,
        lastName: np.lastName,
        email: blankToNull(np.email),
        phone: blankToNull(np.phone),
        normalizedEmail: nEmail,
        normalizedPhone: nPhone,
        source: 'ADVERTISEMENT',
      });
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'person',
        entityId: created.id,
        action: 'CREATED',
        after: {
          firstName: created.firstName,
          lastName: created.lastName,
          email: created.email,
          source: created.source,
        },
        context: {
          via: 'prospect_capture',
          advertisementId: ad.id,
          ...(nameMatches.length > 0
            ? {
                nameMatchOverridden: true,
                nameMatchPersonIds: nameMatches.map((m) => m.id),
              }
            : {}),
        },
      });
      personId = created.id;
      personCreated = true;
    }

    const [existing] = await tx
      .select({ id: recruitmentProspects.id, country: advertisements.country })
      .from(recruitmentProspects)
      .innerJoin(advertisements, eq(advertisements.id, recruitmentProspects.advertisementId))
      .where(
        and(
          eq(advertisements.campaignId, campaign.id),
          eq(recruitmentProspects.personId, personId),
        ),
      )
      .limit(1);
    if (existing) {
      throw new BusinessRuleError(
        'PROSPECT_EXISTS',
        `This person is already a prospect in this campaign (${existing.country} advertisement)`,
      );
    }

    const note = blankToNull(d.notes);
    const [created] = await tx
      .insert(recruitmentProspects)
      .values({
        advertisementId: ad.id,
        personId,
        status: 'NEW',
        notes: note ? noteLine(await actorName(tx, session.user.id), note) : null,
      })
      .returning();
    if (!created) throw new Error('insert returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'recruitment_prospect',
      entityId: created.id,
      action: 'CREATED',
      after: { advertisementId: ad.id, personId, campaignId: campaign.id, status: 'NEW' },
      context: { personCreated },
    });
    return created;
  });
}

/**
 * Cancel the prospect's open follow-up task(s). Used when the follow-up is
 * replaced or cleared, and when the prospect is closed (converted or not
 * suitable) so nobody is reminded to chase a closed prospect.
 */
async function cancelProspectFollowUps(
  tx: DbExecutor,
  prospect: { id: string; personId: string },
  actorUserId: string,
  via: 'prospect_follow_up_replaced' | 'prospect_closed',
): Promise<number> {
  const cancelled = await tx
    .update(tasks)
    .set({ status: 'CANCELLED', completedAt: new Date(), updatedAt: sql`NOW()` })
    .where(
      and(
        eq(tasks.personId, prospect.personId),
        inArray(tasks.status, ['OPEN', 'IN_PROGRESS']),
        isNull(tasks.archivedAt),
        like(tasks.description, `%${followUpMarker(prospect.id)}%`),
      ),
    )
    .returning({ id: tasks.id });
  for (const t of cancelled) {
    await recordAudit(tx, {
      actorUserId,
      entityType: 'task',
      entityId: t.id,
      action: 'STATUS_CHANGED',
      after: { status: 'CANCELLED' },
      context: { via, prospectId: prospect.id },
    });
  }
  return cancelled.length;
}

/* ─── Status, notes, follow-up ─────────────────────────────────────── */

export async function updateProspectStatus(
  input: UpdateProspectStatusInput,
): Promise<RecruitmentProspect> {
  const d = parseOrThrow(UpdateProspectStatusSchema, input, 'Invalid status change');
  const session = await requirePermission('recruitment', 'prospects', 'edit');
  return db.transaction(async (tx) => {
    const { p: before } = await lockProspect(tx, d.prospectId);
    if (before.status === d.status) {
      throw new BusinessRuleError(
        'PROSPECT_ALREADY_IN_STATUS',
        `The prospect is already ${d.status.toLowerCase().replace(/_/g, ' ')}`,
      );
    }
    assertTransition('prospect', before.status, d.status, PROSPECT_TRANSITIONS);
    const note = blankToNull(d.notes);
    const label = d.status.toLowerCase().replace(/_/g, ' ');
    const [after] = await tx
      .update(recruitmentProspects)
      .set({
        status: d.status,
        screenedByUserId: session.user.id,
        notes: note
          ? appendNote(
              before.notes,
              noteLine(await actorName(tx, session.user.id), `Marked ${label}: ${note}`),
            )
          : before.notes,
        updatedAt: sql`NOW()`,
      })
      .where(eq(recruitmentProspects.id, before.id))
      .returning();
    if (!after) throw new Error('update returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'recruitment_prospect',
      entityId: after.id,
      action: 'STATUS_CHANGED',
      before: { status: before.status },
      after: { status: after.status },
      context: note ? { note } : undefined,
    });
    if (after.status === 'NOT_SUITABLE') {
      await cancelProspectFollowUps(tx, after, session.user.id, 'prospect_closed');
    }
    return after;
  });
}

export async function addProspectNote(input: AddProspectNoteInput): Promise<RecruitmentProspect> {
  const d = parseOrThrow(AddProspectNoteSchema, input, 'Invalid note');
  const session = await requirePermission('recruitment', 'prospects', 'edit');
  return db.transaction(async (tx) => {
    const { p: before } = await lockProspect(tx, d.prospectId);
    const [after] = await tx
      .update(recruitmentProspects)
      .set({
        notes: appendNote(before.notes, noteLine(await actorName(tx, session.user.id), d.note)),
        updatedAt: sql`NOW()`,
      })
      .where(eq(recruitmentProspects.id, before.id))
      .returning();
    if (!after) throw new Error('update returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'recruitment_prospect',
      entityId: after.id,
      action: 'NOTE_ADDED',
      after: { note: d.note },
    });
    return after;
  });
}

/**
 * Follow-up = one open task on the prospect's person, tagged with the
 * prospect id, due 09:00 Irish time on the chosen day. Setting a new date
 * replaces the open one; an empty date clears it. Both are audited on the
 * prospect.
 */
export async function setProspectFollowUp(
  input: SetProspectFollowUpInput,
): Promise<{ dueAt: Date | null }> {
  const d = parseOrThrow(SetProspectFollowUpSchema, input, 'Invalid follow-up');
  const session = await requirePermission('recruitment', 'prospects', 'edit');
  if (d.dueOn && d.dueOn < todayInDublin()) {
    throw new ValidationError('The follow-up date cannot be in the past', {
      dueOn: 'The follow-up date cannot be in the past',
    });
  }
  const assigneeId = blankToNull(d.assignedUserId) ?? session.user.id;
  return db.transaction(async (tx) => {
    const row = await lockProspect(tx, d.prospectId);
    const prospect = row.p;
    if (prospect.status === 'CONVERTED_TO_CANDIDATE' || prospect.status === 'NOT_SUITABLE') {
      if (d.dueOn) {
        throw new BusinessRuleError(
          'PROSPECT_CLOSED',
          'Follow-ups are only for prospects still being worked on',
        );
      }
    }
    if (d.dueOn) {
      const [assignee] = await tx
        .select({ id: users.id, isActive: users.isActive, role: users.role })
        .from(users)
        .where(eq(users.id, assigneeId))
        .limit(1);
      if (!assignee?.isActive || ['CANDIDATE', 'EMPLOYER'].includes(assignee.role)) {
        throw new ValidationError('Choose an active staff member', {
          assignedUserId: 'Choose an active staff member',
        });
      }
    }
    const cancelledCount = await cancelProspectFollowUps(
      tx,
      prospect,
      session.user.id,
      'prospect_follow_up_replaced',
    );
    const marker = followUpMarker(prospect.id);

    let dueAt: Date | null = null;
    if (d.dueOn) {
      dueAt = zonedLocalToUtc(`${d.dueOn}T09:00`, BUSINESS_TIMEZONE);
      if (!dueAt) throw new ValidationError('Enter a valid date', { dueOn: 'Enter a valid date' });
      const [person] = await tx
        .select({ firstName: persons.firstName, lastName: persons.lastName })
        .from(persons)
        .where(eq(persons.id, prospect.personId))
        .limit(1);
      const name = person ? `${person.firstName} ${person.lastName}` : 'prospect';
      const [task] = await tx
        .insert(tasks)
        .values({
          title: `Prospect follow-up: ${name}`.slice(0, 255),
          description: `Follow up with ${name} — prospect in campaign "${row.campaignName}" (${row.adCountry}${row.adPlatform ? ` · ${row.adPlatform}` : ''}). ${marker}`,
          dueAt,
          assignedUserId: assigneeId,
          priority: 'NORMAL',
          status: 'OPEN',
          personId: prospect.personId,
        })
        .returning({ id: tasks.id });
      if (!task) throw new Error('task insert returned no row');
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'task',
        entityId: task.id,
        action: 'CREATED',
        after: { title: `Prospect follow-up: ${name}`, dueAt, assignedUserId: assigneeId },
        context: { via: 'prospect_follow_up', prospectId: prospect.id },
      });
    }
    if (dueAt || cancelledCount > 0) {
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'recruitment_prospect',
        entityId: prospect.id,
        action: dueAt ? 'FOLLOW_UP_SET' : 'FOLLOW_UP_CLEARED',
        after: dueAt ? { dueOn: d.dueOn, assignedUserId: assigneeId } : { dueOn: null },
      });
    }
    return { dueAt };
  });
}

/* ─── Conversion hand-off ──────────────────────────────────────────── */

export type ConvertResult = {
  prospect: RecruitmentProspect;
  candidateProfileId: string;
  created: boolean;
  shortlisted: boolean;
  shortlistError: string | null;
};

/**
 * Prospect → candidate. Requires the confirmation tick and a screened (or
 * retained) prospect. Reuses an existing candidate profile, never creates
 * an application. With `shortlistOnJob`, the person is then shortlisted on
 * the campaign's (open) job via the same path as "Add candidate"; if that
 * step is refused the conversion still stands and the reason is returned.
 */
export async function convertProspectToCandidate(
  input: ConvertProspectInput,
): Promise<ConvertResult> {
  const d = parseOrThrow(ConvertProspectSchema, input, 'Invalid conversion');
  const session = await requirePermission('recruitment', 'prospects', 'edit');

  const result = await db.transaction(async (tx) => {
    const row = await lockProspect(tx, d.prospectId);
    const before = row.p;
    if (before.status === 'CONVERTED_TO_CANDIDATE') {
      throw new BusinessRuleError(
        'PROSPECT_ALREADY_CONVERTED',
        'This prospect has already been converted',
      );
    }
    if (before.status !== 'SCREENED' && before.status !== 'RETAINED_IN_POOL') {
      throw new BusinessRuleError(
        'PROSPECT_NOT_SCREENED',
        'Screen the prospect before converting them to a candidate',
      );
    }
    if (d.shortlistOnJob) {
      if (!row.campaignJobId) {
        throw new ValidationError('This campaign has no job to shortlist on', {
          shortlistOnJob: 'This campaign has no job to shortlist on',
        });
      }
      const [job] = await tx
        .select({ status: jobRequisitions.status })
        .from(jobRequisitions)
        .where(eq(jobRequisitions.id, row.campaignJobId))
        .limit(1);
      if (!job || job.status === 'CLOSED' || job.status === 'CANCELLED') {
        throw new BusinessRuleError(
          'CAMPAIGN_JOB_CLOSED',
          'The campaign’s job is closed — convert without shortlisting',
        );
      }
    }

    const [person] = await tx
      .select({
        id: persons.id,
        isDraft: persons.isDraft,
        archivedAt: persons.archivedAt,
        mergedIntoPersonId: persons.mergedIntoPersonId,
      })
      .from(persons)
      .where(eq(persons.id, before.personId))
      .limit(1);
    if (!person) throw new BusinessRuleError('PERSON_NOT_FOUND', 'Person not found');
    if (person.isDraft) {
      throw new BusinessRuleError(
        'PERSON_IS_DRAFT',
        'This person is still a draft — finalise onboarding first',
      );
    }
    if (person.archivedAt || person.mergedIntoPersonId) {
      throw new BusinessRuleError(
        'PERSON_INACTIVE',
        'This person record is archived or merged — use the current record',
      );
    }

    // One profile per person (unique on person_id): reuse, or create once.
    let created = false;
    const inserted = await tx
      .insert(candidateProfiles)
      .values({
        personId: before.personId,
        lifecycleStatus: 'ACTIVE',
        availabilityStatus: 'AVAILABLE',
        assignedUserId: session.user.id,
      })
      .onConflictDoNothing({ target: candidateProfiles.personId })
      .returning({ id: candidateProfiles.id });
    let candidateProfileId: string;
    if (inserted[0]) {
      candidateProfileId = inserted[0].id;
      created = true;
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'candidate_profile',
        entityId: candidateProfileId,
        action: 'CREATED',
        after: { personId: before.personId, via: 'prospect_conversion' },
        context: { prospectId: before.id },
      });
    } else {
      const [existing] = await tx
        .select({ id: candidateProfiles.id })
        .from(candidateProfiles)
        .where(eq(candidateProfiles.personId, before.personId))
        .limit(1);
      if (!existing) throw new Error('candidate profile not found after conflict');
      candidateProfileId = existing.id;
    }

    const note = blankToNull(d.notes);
    const [after] = await tx
      .update(recruitmentProspects)
      .set({
        status: 'CONVERTED_TO_CANDIDATE',
        screenedByUserId: session.user.id,
        notes: note
          ? appendNote(
              before.notes,
              noteLine(await actorName(tx, session.user.id), `Converted: ${note}`),
            )
          : before.notes,
        updatedAt: sql`NOW()`,
      })
      .where(eq(recruitmentProspects.id, before.id))
      .returning();
    if (!after) throw new Error('prospect conversion update returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'recruitment_prospect',
      entityId: after.id,
      action: 'CONVERTED',
      before: { status: before.status },
      after: { status: after.status },
      context: {
        candidateProfileId,
        profileCreated: created,
        shortlistRequested: Boolean(d.shortlistOnJob),
        confirmed: true,
        ...(note ? { note } : {}),
      },
    });
    await cancelProspectFollowUps(tx, after, session.user.id, 'prospect_closed');
    return { prospect: after, candidateProfileId, created, jobId: row.campaignJobId };
  });

  let shortlisted = false;
  let shortlistError: string | null = null;
  if (d.shortlistOnJob && result.jobId) {
    try {
      await manuallyShortlistPerson(result.prospect.personId, result.jobId);
      shortlisted = true;
    } catch (e) {
      shortlistError = e instanceof Error ? e.message : 'Could not shortlist';
    }
  }
  return {
    prospect: result.prospect,
    candidateProfileId: result.candidateProfileId,
    created: result.created,
    shortlisted,
    shortlistError,
  };
}

/* ─── Reads: one prospect + history ────────────────────────────────── */

export type ProspectDetail = ProspectRow & {
  campaignStatus: string;
  campaignArchived: boolean;
  campaignJobId: string | null;
  campaignJobTitle: string | null;
  personPhone: string | null;
  otherCampaigns: Array<{
    prospectId: string;
    campaignId: string;
    campaignName: string;
    status: string;
  }>;
  history: Array<{
    id: string;
    occurredAt: Date;
    actorName: string | null;
    action: string;
    summary: string;
  }>;
};

function describeProspectEvent(
  action: string,
  before: unknown,
  after: unknown,
  context: unknown,
): string {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  const c = (context ?? {}) as Record<string, unknown>;
  const pretty = (s: unknown) =>
    String(s ?? '')
      .toLowerCase()
      .replace(/_/g, ' ');
  switch (action) {
    case 'CREATED':
      return 'Prospect recorded';
    case 'STATUS_CHANGED':
      return `Status: ${pretty(b.status)} → ${pretty(a.status)}${c.note ? ` — ${String(c.note)}` : ''}`;
    case 'CONVERTED':
      return `Converted to candidate${c.profileCreated ? ' (new profile)' : ' (existing profile reused)'}`;
    case 'NOTE_ADDED':
      return `Note: ${String(a.note ?? '')}`;
    case 'FOLLOW_UP_SET':
      return `Follow-up set for ${String(a.dueOn ?? '')}`;
    case 'FOLLOW_UP_CLEARED':
      return 'Follow-up cleared';
    default:
      return pretty(action);
  }
}

export async function fetchProspectDetail(id: string): Promise<ProspectDetail | null> {
  await requirePermission('recruitment', 'prospects', 'view');
  const [row] = await prospectSelect().where(eq(recruitmentProspects.id, id)).limit(1);
  if (!row) return null;
  const base = toProspectRow(row);
  const [ctx] = await db
    .select({
      status: recruitmentCampaigns.status,
      archivedAt: recruitmentCampaigns.archivedAt,
      jobId: recruitmentCampaigns.jobRequisitionId,
      jobTitle: jobRequisitions.title,
      phone: persons.phone,
    })
    .from(recruitmentCampaigns)
    .leftJoin(jobRequisitions, eq(jobRequisitions.id, recruitmentCampaigns.jobRequisitionId))
    .innerJoin(persons, eq(persons.id, base.personId))
    .where(eq(recruitmentCampaigns.id, base.campaignId))
    .limit(1);
  const others = await db
    .select({
      prospectId: recruitmentProspects.id,
      campaignId: recruitmentCampaigns.id,
      campaignName: recruitmentCampaigns.name,
      status: recruitmentProspects.status,
    })
    .from(recruitmentProspects)
    .innerJoin(advertisements, eq(advertisements.id, recruitmentProspects.advertisementId))
    .innerJoin(recruitmentCampaigns, eq(recruitmentCampaigns.id, advertisements.campaignId))
    .where(and(eq(recruitmentProspects.personId, base.personId), ne(recruitmentProspects.id, id)));
  const events = await db.execute<{
    id: string;
    occurred_at: Date | string;
    actor_name: string | null;
    action: string;
    before: unknown;
    after: unknown;
    context: unknown;
  }>(sql`
    SELECT e.id, e.occurred_at, u.full_name AS actor_name, e.action, e.before, e.after, e.context
    FROM audit_events e LEFT JOIN users u ON u.id = e.actor_user_id
    WHERE e.entity_type = 'recruitment_prospect' AND e.entity_id = ${id}
    ORDER BY e.occurred_at DESC, e.id DESC
    LIMIT 100
  `);
  return {
    ...base,
    campaignStatus: ctx?.status ?? 'DRAFT',
    campaignArchived: Boolean(ctx?.archivedAt),
    campaignJobId: ctx?.jobId ?? null,
    campaignJobTitle: ctx?.jobTitle ?? null,
    personPhone: ctx?.phone ?? null,
    otherCampaigns: others,
    history: events.map((e) => ({
      id: e.id,
      occurredAt: new Date(e.occurred_at),
      actorName: e.actor_name,
      action: e.action,
      summary: describeProspectEvent(e.action, e.before, e.after, e.context),
    })),
  };
}

/* ─── Campaign activity feed ───────────────────────────────────────── */

export type CampaignActivityRow = {
  id: string;
  occurredAt: Date;
  actorName: string | null;
  summary: string;
};

const ENTITY_LABEL: Record<string, string> = {
  recruitment_campaign: 'Campaign',
  advertisement: 'Advertisement',
  recruitment_prospect: 'Prospect',
};

function describeCampaignEvent(
  entityType: string,
  action: string,
  before: unknown,
  after: unknown,
  context: unknown,
): string {
  if (entityType === 'recruitment_prospect') {
    return `Prospect: ${describeProspectEvent(action, before, after, context)}`;
  }
  const label = ENTITY_LABEL[entityType] ?? entityType;
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  const c = (context ?? {}) as Record<string, unknown>;
  const pretty = (s: unknown) =>
    String(s ?? '')
      .toLowerCase()
      .replace(/_/g, ' ');
  if (action === 'STATUS_CHANGED' && a.status) {
    const from = b.status ? `${pretty(b.status)} → ` : '';
    const why = c.reason
      ? ` — ${String(c.reason)}`
      : c.via === 'campaign_ended'
        ? ' (campaign ended)'
        : '';
    return `${label} ${from}${pretty(a.status)}${why}`;
  }
  if (action === 'ARCHIVED' || action === 'UNARCHIVED') {
    return `${label} ${pretty(action)}${c.reason ? ` — ${String(c.reason)}` : ''}`;
  }
  return `${label} ${pretty(action)}`;
}

export async function fetchCampaignActivity(
  campaignId: string,
  opts?: { page?: number; pageSize?: number },
): Promise<{ rows: CampaignActivityRow[]; page: number; hasMore: boolean }> {
  await requireInternalStaff();
  const pageSize = Math.min(Math.max(opts?.pageSize ?? 25, 1), 100);
  const page = Math.max(1, Math.floor(opts?.page ?? 1));
  const rows = await db.execute<{
    id: string;
    occurred_at: Date | string;
    actor_name: string | null;
    entity_type: string;
    action: string;
    before: unknown;
    after: unknown;
    context: unknown;
  }>(sql`
    SELECT e.id, e.occurred_at, u.full_name AS actor_name, e.entity_type, e.action, e.before, e.after, e.context
    FROM audit_events e LEFT JOIN users u ON u.id = e.actor_user_id
    WHERE (e.entity_type = 'recruitment_campaign' AND e.entity_id = ${campaignId}::text)
       OR (e.entity_type = 'advertisement' AND e.entity_id IN (SELECT id::text FROM advertisements WHERE campaign_id = ${campaignId}))
       OR (e.entity_type = 'recruitment_prospect' AND e.entity_id IN (
             SELECT p.id::text FROM recruitment_prospects p JOIN advertisements a ON a.id = p.advertisement_id
             WHERE a.campaign_id = ${campaignId}))
    ORDER BY e.occurred_at DESC, e.id DESC
    LIMIT ${pageSize + 1} OFFSET ${(page - 1) * pageSize}
  `);
  return {
    page,
    hasMore: rows.length > pageSize,
    rows: rows.slice(0, pageSize).map((r) => ({
      id: r.id,
      occurredAt: new Date(r.occurred_at),
      actorName: r.actor_name,
      summary: describeCampaignEvent(r.entity_type, r.action, r.before, r.after, r.context),
    })),
  };
}

/** Staff a follow-up can be assigned to (active internal users, names only). */
export async function fetchFollowUpAssignees(): Promise<Array<{ id: string; fullName: string }>> {
  await requireInternalStaff();
  return db
    .select({ id: users.id, fullName: users.fullName })
    .from(users)
    .where(and(eq(users.isActive, true), sql`${users.role} NOT IN ('CANDIDATE','EMPLOYER')`))
    .orderBy(users.fullName);
}
