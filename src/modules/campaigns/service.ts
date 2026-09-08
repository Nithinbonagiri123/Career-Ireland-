import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireInternalStaff } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import {
  type Advertisement,
  advertisements,
  type RecruitmentCampaign,
  type RecruitmentProspect,
  recruitmentCampaigns,
  recruitmentProspects,
} from '@/lib/db/schema/campaigns';
import { candidateProfiles, persons } from '@/lib/db/schema/persons';
import { jobRequisitions } from '@/lib/db/schema/recruitment';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import {
  type ArchiveCampaignInput,
  ArchiveCampaignSchema,
  type ConvertProspectInput,
  ConvertProspectSchema,
  type CreateProspectInput,
  CreateProspectSchema,
  type ListProspectsInput,
  ListProspectsSchema,
  type UnarchiveCampaignInput,
  UnarchiveCampaignSchema,
  type UpdateProspectStatusInput,
  UpdateProspectStatusSchema,
  type UpsertAdInput,
  UpsertAdSchema,
  type UpsertCampaignInput,
  UpsertCampaignSchema,
} from './schemas';

function blankToNull(v: string | undefined | null): string | null {
  return v && v.trim().length > 0 ? v : null;
}

export type CampaignListRow = RecruitmentCampaign & {
  requisitionTitle: string | null;
};

export async function fetchCampaigns(): Promise<CampaignListRow[]> {
  await requireInternalStaff();
  const rows = await db
    .select({
      c: recruitmentCampaigns,
      title: jobRequisitions.title,
    })
    .from(recruitmentCampaigns)
    .leftJoin(jobRequisitions, eq(jobRequisitions.id, recruitmentCampaigns.jobRequisitionId))
    .where(isNull(recruitmentCampaigns.archivedAt))
    .orderBy(desc(recruitmentCampaigns.createdAt));
  return rows.map((r) => ({ ...r.c, requisitionTitle: r.title }));
}

export async function upsertCampaign(input: UpsertCampaignInput): Promise<RecruitmentCampaign> {
  const session = await requireInternalStaff();
  const parsed = UpsertCampaignSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid campaign',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const d = parsed.data;
  const values = {
    jobRequisitionId: blankToNull(d.jobRequisitionId) ?? undefined,
    name: d.name.trim(),
    status: d.status,
    notes: blankToNull(d.notes),
  };
  return db.transaction(async (tx) => {
    if (d.id) {
      const [before] = await tx
        .select()
        .from(recruitmentCampaigns)
        .where(eq(recruitmentCampaigns.id, d.id))
        .limit(1);
      if (!before) throw new BusinessRuleError('CAMPAIGN_NOT_FOUND', 'Campaign not found');
      const [after] = await tx
        .update(recruitmentCampaigns)
        .set({
          ...values,
          startedAt: d.status === 'ACTIVE' && !before.startedAt ? new Date() : before.startedAt,
          endedAt:
            d.status === 'COMPLETED' || d.status === 'CANCELLED'
              ? (before.endedAt ?? new Date())
              : before.endedAt,
          updatedAt: sql`NOW()`,
        })
        .where(eq(recruitmentCampaigns.id, d.id))
        .returning();
      if (!after) throw new Error('update returned no row');
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'recruitment_campaign',
        entityId: after.id,
        action: 'UPDATED',
        before: { name: before.name, status: before.status },
        after: { name: after.name, status: after.status },
      });
      return after;
    }
    const [created] = await tx
      .insert(recruitmentCampaigns)
      .values({
        ...values,
        startedAt: d.status === 'ACTIVE' ? new Date() : null,
      })
      .returning();
    if (!created) throw new Error('insert returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'recruitment_campaign',
      entityId: created.id,
      action: 'CREATED',
      after: { name: created.name, status: created.status },
    });
    return created;
  });
}

export async function fetchCampaign(id: string): Promise<CampaignListRow | null> {
  await requireInternalStaff();
  const [row] = await db
    .select({ c: recruitmentCampaigns, title: jobRequisitions.title })
    .from(recruitmentCampaigns)
    .leftJoin(jobRequisitions, eq(jobRequisitions.id, recruitmentCampaigns.jobRequisitionId))
    .where(eq(recruitmentCampaigns.id, id))
    .limit(1);
  return row ? { ...row.c, requisitionTitle: row.title } : null;
}

export async function fetchAdsForCampaign(campaignId: string): Promise<Advertisement[]> {
  await requireInternalStaff();
  return db
    .select()
    .from(advertisements)
    .where(eq(advertisements.campaignId, campaignId))
    .orderBy(desc(advertisements.startDate));
}

export async function upsertAdvertisement(input: UpsertAdInput): Promise<Advertisement> {
  const session = await requireInternalStaff();
  const parsed = UpsertAdSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid advertisement',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const d = parsed.data;
  if (new Date(d.expiryDate) <= new Date(d.startDate)) {
    throw new BusinessRuleError('AD_INVALID_DATES', 'Expiry must be after start date');
  }
  const values = {
    campaignId: d.campaignId,
    country: d.country,
    platform: blankToNull(d.platform),
    targetApplicants: d.targetApplicants,
    startDate: d.startDate,
    expiryDate: d.expiryDate,
    status: d.status,
    notes: blankToNull(d.notes),
  };
  return db.transaction(async (tx) => {
    if (d.id) {
      const [before] = await tx
        .select()
        .from(advertisements)
        .where(eq(advertisements.id, d.id))
        .limit(1);
      if (!before) throw new BusinessRuleError('AD_NOT_FOUND', 'Advertisement not found');
      const [after] = await tx
        .update(advertisements)
        .set({ ...values, updatedAt: sql`NOW()` })
        .where(eq(advertisements.id, d.id))
        .returning();
      if (!after) throw new Error('update returned no row');
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'advertisement',
        entityId: after.id,
        action: 'UPDATED',
        before: {
          country: before.country,
          targetApplicants: before.targetApplicants,
          status: before.status,
        },
        after: {
          country: after.country,
          targetApplicants: after.targetApplicants,
          status: after.status,
        },
      });
      return after;
    }
    const [created] = await tx.insert(advertisements).values(values).returning();
    if (!created) throw new Error('insert returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'advertisement',
      entityId: created.id,
      action: 'CREATED',
      after: {
        country: created.country,
        targetApplicants: created.targetApplicants,
        status: created.status,
      },
    });
    return created;
  });
}

export type ProspectListRow = RecruitmentProspect & {
  personName: string;
  personEmail: string | null;
  advertisementCountry: string;
};

export async function fetchProspectsForAd(adId: string): Promise<ProspectListRow[]> {
  await requireInternalStaff();
  const rows = await db
    .select({
      p: recruitmentProspects,
      firstName: persons.firstName,
      lastName: persons.lastName,
      email: persons.email,
      country: advertisements.country,
    })
    .from(recruitmentProspects)
    .innerJoin(persons, eq(persons.id, recruitmentProspects.personId))
    .innerJoin(advertisements, eq(advertisements.id, recruitmentProspects.advertisementId))
    .where(eq(recruitmentProspects.advertisementId, adId))
    .orderBy(desc(recruitmentProspects.createdAt));
  return rows.map((r) => ({
    ...r.p,
    personName: `${r.firstName} ${r.lastName}`,
    personEmail: r.email,
    advertisementCountry: r.country,
  }));
}

export async function createProspect(input: CreateProspectInput): Promise<RecruitmentProspect> {
  const session = await requireInternalStaff();
  const parsed = CreateProspectSchema.parse(input);
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(recruitmentProspects)
      .where(
        and(
          eq(recruitmentProspects.advertisementId, parsed.advertisementId),
          eq(recruitmentProspects.personId, parsed.personId),
        ),
      )
      .limit(1);
    if (existing) {
      throw new BusinessRuleError(
        'PROSPECT_EXISTS',
        'This person is already recorded as a prospect for this advertisement',
      );
    }
    const [created] = await tx
      .insert(recruitmentProspects)
      .values({
        advertisementId: parsed.advertisementId,
        personId: parsed.personId,
        status: 'NEW',
      })
      .returning();
    if (!created) throw new Error('insert returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'recruitment_prospect',
      entityId: created.id,
      action: 'CREATED',
      after: { advertisementId: created.advertisementId, personId: created.personId },
    });
    return created;
  });
}

export async function updateProspectStatus(
  input: UpdateProspectStatusInput,
): Promise<RecruitmentProspect> {
  const session = await requireInternalStaff();
  const parsed = UpdateProspectStatusSchema.parse(input);
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(recruitmentProspects)
      .where(eq(recruitmentProspects.id, parsed.prospectId))
      .limit(1);
    if (!before) throw new BusinessRuleError('PROSPECT_NOT_FOUND', 'Prospect not found');
    if (before.status === parsed.status) return before;
    const [after] = await tx
      .update(recruitmentProspects)
      .set({
        status: parsed.status,
        screenedByUserId: session.user.id,
        notes: parsed.notes ? parsed.notes : before.notes,
        updatedAt: sql`NOW()`,
      })
      .where(eq(recruitmentProspects.id, parsed.prospectId))
      .returning();
    if (!after) throw new Error('update returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'recruitment_prospect',
      entityId: after.id,
      action: 'STATUS_CHANGED',
      before: { status: before.status },
      after: { status: after.status },
      context: parsed.notes ? { note: parsed.notes } : undefined,
    });
    return after;
  });
}

// ─── Cross-campaign prospect list ─────────────────────────────────────────────

export type ProspectRow = RecruitmentProspect & {
  personName: string;
  personEmail: string | null;
  advertisementCountry: string;
  advertisementPlatform: string | null;
  campaignId: string;
  campaignName: string;
  hasCandidateProfile: boolean;
};

/**
 * Cross-campaign prospect list. Callers pass through `searchParams` after
 * validating with ListProspectsSchema. Unknown filters silently no-op —
 * the schema will have already stripped them.
 *
 * Ordering: newest first. Prospects only surface a person's `firstName +
 * lastName` today; email search is exact-substring against the person's
 * stored email.
 */
export async function fetchProspects(input: ListProspectsInput = {}): Promise<ProspectRow[]> {
  await requireInternalStaff();
  const parsed = ListProspectsSchema.parse(input);
  const like = parsed.q ? `%${parsed.q.trim()}%` : null;

  const conditions = [
    parsed.status ? eq(recruitmentProspects.status, parsed.status) : undefined,
    parsed.campaignId ? eq(advertisements.campaignId, parsed.campaignId) : undefined,
    parsed.country ? eq(advertisements.country, parsed.country) : undefined,
    like
      ? or(
          ilike(persons.firstName, like),
          ilike(persons.lastName, like),
          ilike(persons.normalizedEmail, like),
        )
      : undefined,
  ].filter((c): c is NonNullable<typeof c> => c !== undefined);

  const rows = await db
    .select({
      p: recruitmentProspects,
      firstName: persons.firstName,
      lastName: persons.lastName,
      email: persons.email,
      country: advertisements.country,
      platform: advertisements.platform,
      campaignId: recruitmentCampaigns.id,
      campaignName: recruitmentCampaigns.name,
      candidateProfileId: candidateProfiles.id,
    })
    .from(recruitmentProspects)
    .innerJoin(persons, eq(persons.id, recruitmentProspects.personId))
    .innerJoin(advertisements, eq(advertisements.id, recruitmentProspects.advertisementId))
    .innerJoin(recruitmentCampaigns, eq(recruitmentCampaigns.id, advertisements.campaignId))
    .leftJoin(candidateProfiles, eq(candidateProfiles.personId, persons.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(recruitmentProspects.createdAt))
    .limit(200);

  return rows.map((r) => ({
    ...r.p,
    personName: `${r.firstName} ${r.lastName}`,
    personEmail: r.email,
    advertisementCountry: r.country,
    advertisementPlatform: r.platform,
    campaignId: r.campaignId,
    campaignName: r.campaignName,
    hasCandidateProfile: r.candidateProfileId !== null,
  }));
}

/** Distinct advertisement countries. Powers the country filter dropdown. */
export async function fetchProspectCountries(): Promise<string[]> {
  await requireInternalStaff();
  const rows = await db
    .selectDistinct({ country: advertisements.country })
    .from(advertisements)
    .orderBy(advertisements.country);
  return rows.map((r) => r.country);
}

/**
 * One-shot conversion: prospect → candidate. If the underlying person
 * already has a candidate_profile (they were converted via some other
 * flow — leads, direct add), we reuse it rather than erroring; the
 * prospect just flips to CONVERTED_TO_CANDIDATE.
 *
 * Guards:
 *   - Prospect must exist and not already be CONVERTED_TO_CANDIDATE
 *   - Person must not be a draft (unfinalised onboarding)
 * Audit: emits STATUS_CHANGED on prospect + CREATED on candidate_profile
 * when we actually create one.
 */
export async function convertProspectToCandidate(
  input: ConvertProspectInput,
): Promise<{ prospect: RecruitmentProspect; candidateProfileId: string; created: boolean }> {
  const session = await requireInternalStaff();
  const parsed = ConvertProspectSchema.parse(input);
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(recruitmentProspects)
      .where(eq(recruitmentProspects.id, parsed.prospectId))
      .limit(1);
    if (!before) throw new BusinessRuleError('PROSPECT_NOT_FOUND', 'Prospect not found');
    if (before.status === 'CONVERTED_TO_CANDIDATE') {
      throw new BusinessRuleError(
        'PROSPECT_ALREADY_CONVERTED',
        'Prospect is already converted to a candidate',
      );
    }

    const [person] = await tx
      .select({ id: persons.id, isDraft: persons.isDraft })
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

    const [existingProfile] = await tx
      .select({ id: candidateProfiles.id })
      .from(candidateProfiles)
      .where(eq(candidateProfiles.personId, before.personId))
      .limit(1);

    let candidateProfileId: string;
    let created = false;
    if (existingProfile) {
      candidateProfileId = existingProfile.id;
    } else {
      const [profile] = await tx
        .insert(candidateProfiles)
        .values({
          personId: before.personId,
          lifecycleStatus: 'ACTIVE',
          availabilityStatus: 'AVAILABLE',
          assignedUserId: session.user.id,
        })
        .returning({ id: candidateProfiles.id });
      if (!profile) throw new Error('candidate_profiles insert returned no row');
      candidateProfileId = profile.id;
      created = true;
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'candidate_profile',
        entityId: profile.id,
        action: 'CREATED',
        after: { personId: before.personId, via: 'prospect_conversion' },
        context: { prospectId: before.id },
      });
    }

    const [after] = await tx
      .update(recruitmentProspects)
      .set({
        status: 'CONVERTED_TO_CANDIDATE',
        screenedByUserId: session.user.id,
        notes: parsed.notes ? parsed.notes : before.notes,
        updatedAt: sql`NOW()`,
      })
      .where(eq(recruitmentProspects.id, before.id))
      .returning();
    if (!after) throw new Error('prospect conversion update returned no row');

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'recruitment_prospect',
      entityId: after.id,
      action: 'STATUS_CHANGED',
      before: { status: before.status },
      after: { status: after.status },
      context: {
        via: 'convert_to_candidate',
        candidateProfileId,
        profileCreated: created,
        ...(parsed.notes ? { note: parsed.notes } : {}),
      },
    });

    return { prospect: after, candidateProfileId, created };
  });
}

// ─── Archive / unarchive ──────────────────────────────────────────────────────

async function findCampaign(tx: Parameters<typeof recordAudit>[0], id: string) {
  const [row] = await tx
    .select()
    .from(recruitmentCampaigns)
    .where(eq(recruitmentCampaigns.id, id))
    .limit(1);
  return row ?? null;
}

export async function archiveCampaign(input: ArchiveCampaignInput): Promise<RecruitmentCampaign> {
  const session = await requireInternalStaff();
  const parsed = ArchiveCampaignSchema.parse(input);
  return db.transaction(async (tx) => {
    const before = await findCampaign(tx, parsed.campaignId);
    if (!before) throw new BusinessRuleError('CAMPAIGN_NOT_FOUND', 'Campaign not found');
    if (before.archivedAt) {
      throw new BusinessRuleError('ALREADY_ARCHIVED', 'Campaign is already archived');
    }
    const [after] = await tx
      .update(recruitmentCampaigns)
      .set({
        archivedAt: new Date(),
        archivedByUserId: session.user.id,
        updatedAt: sql`NOW()`,
      })
      .where(eq(recruitmentCampaigns.id, parsed.campaignId))
      .returning();
    if (!after) throw new Error('archive returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'recruitment_campaign',
      entityId: after.id,
      action: 'ARCHIVED',
      before: { archivedAt: null },
      after: { archivedAt: after.archivedAt },
      context: { reason: parsed.reason },
    });
    return after;
  });
}

export async function unarchiveCampaign(
  input: UnarchiveCampaignInput,
): Promise<RecruitmentCampaign> {
  const session = await requireInternalStaff();
  const parsed = UnarchiveCampaignSchema.parse(input);
  return db.transaction(async (tx) => {
    const before = await findCampaign(tx, parsed.campaignId);
    if (!before) throw new BusinessRuleError('CAMPAIGN_NOT_FOUND', 'Campaign not found');
    if (!before.archivedAt) {
      throw new BusinessRuleError('NOT_ARCHIVED', 'Campaign is not archived');
    }
    const [after] = await tx
      .update(recruitmentCampaigns)
      .set({ archivedAt: null, archivedByUserId: null, updatedAt: sql`NOW()` })
      .where(eq(recruitmentCampaigns.id, parsed.campaignId))
      .returning();
    if (!after) throw new Error('unarchive returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'recruitment_campaign',
      entityId: after.id,
      action: 'UNARCHIVED',
      before: { archivedAt: before.archivedAt },
      after: { archivedAt: null },
      context: { reason: parsed.reason },
    });
    return after;
  });
}
