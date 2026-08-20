import { and, desc, eq, sql } from 'drizzle-orm';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import {
  type Advertisement,
  advertisements,
  type RecruitmentCampaign,
  type RecruitmentProspect,
  recruitmentCampaigns,
  recruitmentProspects,
} from '@/lib/db/schema/campaigns';
import { persons } from '@/lib/db/schema/persons';
import { jobRequisitions } from '@/lib/db/schema/recruitment';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import {
  type CreateProspectInput,
  CreateProspectSchema,
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
  await requireRole(['ADMIN', 'STAFF']);
  const rows = await db
    .select({
      c: recruitmentCampaigns,
      title: jobRequisitions.title,
    })
    .from(recruitmentCampaigns)
    .leftJoin(jobRequisitions, eq(jobRequisitions.id, recruitmentCampaigns.jobRequisitionId))
    .orderBy(desc(recruitmentCampaigns.createdAt));
  return rows.map((r) => ({ ...r.c, requisitionTitle: r.title }));
}

export async function upsertCampaign(input: UpsertCampaignInput): Promise<RecruitmentCampaign> {
  const session = await requireRole(['ADMIN', 'STAFF']);
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
  await requireRole(['ADMIN', 'STAFF']);
  const [row] = await db
    .select({ c: recruitmentCampaigns, title: jobRequisitions.title })
    .from(recruitmentCampaigns)
    .leftJoin(jobRequisitions, eq(jobRequisitions.id, recruitmentCampaigns.jobRequisitionId))
    .where(eq(recruitmentCampaigns.id, id))
    .limit(1);
  return row ? { ...row.c, requisitionTitle: row.title } : null;
}

export async function fetchAdsForCampaign(campaignId: string): Promise<Advertisement[]> {
  await requireRole(['ADMIN', 'STAFF']);
  return db
    .select()
    .from(advertisements)
    .where(eq(advertisements.campaignId, campaignId))
    .orderBy(desc(advertisements.startDate));
}

export async function upsertAdvertisement(input: UpsertAdInput): Promise<Advertisement> {
  const session = await requireRole(['ADMIN', 'STAFF']);
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
  await requireRole(['ADMIN', 'STAFF']);
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
  const session = await requireRole(['ADMIN', 'STAFF']);
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
  const session = await requireRole(['ADMIN', 'STAFF']);
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
