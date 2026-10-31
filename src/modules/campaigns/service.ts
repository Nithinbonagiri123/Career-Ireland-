import { and, desc, eq, ilike, inArray, isNotNull, isNull, or, type SQL, sql } from 'drizzle-orm';
import type { ZodType } from 'zod';
import { type DbExecutor, recordAudit } from '@/lib/audit/withAudit';
import { requireInternalStaff, requirePermission } from '@/lib/auth/session';
import { type DateRange, dateRangeWhere } from '@/lib/date-range';
import { db } from '@/lib/db/client';
import {
  type Advertisement,
  advertisements,
  type RecruitmentCampaign,
  recruitmentCampaigns,
  recruitmentProspects,
} from '@/lib/db/schema/campaigns';
import { candidateProfiles, persons } from '@/lib/db/schema/persons';
import { employers, jobRequisitions } from '@/lib/db/schema/recruitment';
import { users } from '@/lib/db/schema/users';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import {
  ADVERTISEMENT_TRANSITIONS,
  assertTransition,
  CAMPAIGN_TRANSITIONS,
} from '@/lib/state-machine';
import {
  CAMPAIGNABLE_JOB_STATUSES,
  type JobIneligibility,
  jobIneligibility,
  jobIneligibleMessage,
} from './job-eligibility';
import {
  type ArchiveCampaignInput,
  ArchiveCampaignSchema,
  type ListProspectsInput,
  ListProspectsSchema,
  type SaveCampaignInput,
  SaveCampaignSchema,
  type TransitionCampaignInput,
  TransitionCampaignSchema,
  type UnarchiveCampaignInput,
  UnarchiveCampaignSchema,
  type UpsertAdInput,
  UpsertAdSchema,
} from './schemas';
import { cancelAdReminderTask, ensureAdReminderTask } from './task-generator';

/**
 * R4 — recruitment campaigns. A campaign (optionally) targets one job; its
 * employer is that job's employer, so campaign ↔ employer ↔ job can never
 * disagree. Campaigns hold advertisements; prospects respond to an ad.
 *
 * Reads used by the employer / job workspaces stay open to internal staff
 * (as before). Writes need recruitment.campaigns (create / edit).
 */

function blankToNull(v: string | undefined | null): string | null {
  return v && v.trim().length > 0 ? v.trim() : null;
}

/** Parse with Zod; on failure raise a ValidationError with one message per field. */
export function parseOrThrow<T>(schema: ZodType<T>, input: unknown, message: string): T {
  const r = schema.safeParse(input);
  if (r.success) return r.data;
  const fields: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const key = issue.path.map(String).join('.') || 'form';
    fields[key] ??= issue.message;
  }
  throw new ValidationError(Object.values(fields)[0] ?? message, fields);
}

const ENDED_CAMPAIGN = ['COMPLETED', 'CANCELLED'] as const;

/* ─── Reads ────────────────────────────────────────────────────────── */

export type CampaignListRow = RecruitmentCampaign & {
  requisitionTitle: string | null;
  requisitionStatus: string | null;
  employerId: string | null;
  employerName: string | null;
  adCount: number;
  activeAdCount: number;
  prospectCount: number;
  convertedCount: number;
  createdByName: string | null;
};

const adCountSql = sql<number>`(SELECT COUNT(*)::int FROM advertisements a WHERE a.campaign_id = ${recruitmentCampaigns.id})`;
const activeAdCountSql = sql<number>`(SELECT COUNT(*)::int FROM advertisements a WHERE a.campaign_id = ${recruitmentCampaigns.id} AND a.status = 'ACTIVE')`;
const prospectCountSql = sql<number>`(SELECT COUNT(*)::int FROM recruitment_prospects p JOIN advertisements a ON a.id = p.advertisement_id WHERE a.campaign_id = ${recruitmentCampaigns.id})`;
const convertedCountSql = sql<number>`(SELECT COUNT(*)::int FROM recruitment_prospects p JOIN advertisements a ON a.id = p.advertisement_id WHERE a.campaign_id = ${recruitmentCampaigns.id} AND p.status = 'CONVERTED_TO_CANDIDATE')`;
const createdBySql = sql<
  string | null
>`(SELECT u.full_name FROM audit_events e JOIN users u ON u.id = e.actor_user_id WHERE e.entity_type = 'recruitment_campaign' AND e.entity_id = ${recruitmentCampaigns.id}::text AND e.action = 'CREATED' ORDER BY e.occurred_at ASC LIMIT 1)`;

function campaignSelect() {
  return db
    .select({
      c: recruitmentCampaigns,
      title: jobRequisitions.title,
      reqStatus: jobRequisitions.status,
      employerId: employers.id,
      employerName: employers.legalName,
      adCount: adCountSql,
      activeAdCount: activeAdCountSql,
      prospectCount: prospectCountSql,
      convertedCount: convertedCountSql,
      createdByName: createdBySql,
    })
    .from(recruitmentCampaigns)
    .leftJoin(jobRequisitions, eq(jobRequisitions.id, recruitmentCampaigns.jobRequisitionId))
    .leftJoin(employers, eq(employers.id, jobRequisitions.employerId));
}

type CampaignSelectRow = Awaited<ReturnType<ReturnType<typeof campaignSelect>['execute']>>[number];

function toListRow(r: CampaignSelectRow): CampaignListRow {
  return {
    ...r.c,
    requisitionTitle: r.title,
    requisitionStatus: r.reqStatus,
    employerId: r.employerId,
    employerName: r.employerName,
    adCount: r.adCount,
    activeAdCount: r.activeAdCount,
    prospectCount: r.prospectCount,
    convertedCount: r.convertedCount,
    createdByName: r.createdByName,
  };
}

export async function fetchCampaigns(
  createdRange?: DateRange,
  opts?: { archived?: boolean },
): Promise<CampaignListRow[]> {
  await requireInternalStaff();
  const whereConds: SQL[] = [
    opts?.archived
      ? isNotNull(recruitmentCampaigns.archivedAt)
      : isNull(recruitmentCampaigns.archivedAt),
  ];
  const createdCond = createdRange
    ? dateRangeWhere(recruitmentCampaigns.createdAt, createdRange)
    : undefined;
  if (createdCond) whereConds.push(createdCond);
  const rows = await campaignSelect()
    .where(and(...whereConds))
    .orderBy(desc(recruitmentCampaigns.createdAt));
  return rows.map(toListRow);
}

/** Campaigns for one job (job workspace "Advertising" panel). */
export async function fetchCampaignsForRequisition(
  requisitionId: string,
): Promise<CampaignListRow[]> {
  await requireInternalStaff();
  const rows = await campaignSelect()
    .where(
      and(
        eq(recruitmentCampaigns.jobRequisitionId, requisitionId),
        isNull(recruitmentCampaigns.archivedAt),
      ),
    )
    .orderBy(desc(recruitmentCampaigns.createdAt));
  return rows.map(toListRow);
}

/** Campaigns for an employer's jobs (employer workspace "Advertising" panel). */
export async function fetchCampaignsForEmployer(employerId: string): Promise<CampaignListRow[]> {
  await requireInternalStaff();
  const rows = await campaignSelect()
    .where(and(eq(jobRequisitions.employerId, employerId), isNull(recruitmentCampaigns.archivedAt)))
    .orderBy(desc(recruitmentCampaigns.createdAt));
  return rows.map(toListRow);
}

export async function fetchCampaign(id: string): Promise<CampaignListRow | null> {
  await requireInternalStaff();
  const [row] = await campaignSelect().where(eq(recruitmentCampaigns.id, id)).limit(1);
  return row ? toListRow(row) : null;
}

export type AdRow = Advertisement & { prospectCount: number };

export async function fetchAdsForCampaign(campaignId: string): Promise<AdRow[]> {
  await requireInternalStaff();
  const rows = await db
    .select({
      ad: advertisements,
      prospectCount: sql<number>`(SELECT COUNT(*)::int FROM recruitment_prospects p WHERE p.advertisement_id = ${advertisements.id})`,
    })
    .from(advertisements)
    .where(eq(advertisements.campaignId, campaignId))
    .orderBy(desc(advertisements.startDate));
  return rows.map((r) => ({ ...r.ad, prospectCount: r.prospectCount }));
}

/**
 * Jobs a campaign can be linked to, optionally for one employer. Only jobs
 * that pass the shared "can be advertised" rule (job-eligibility.ts):
 * not archived, employer not archived, status OPEN / IN_PROGRESS /
 * PARTIALLY_FILLED.
 */
export async function fetchJobsForCampaignPicker(
  employerId?: string,
): Promise<
  Array<{ id: string; title: string; employerId: string; employerName: string; status: string }>
> {
  await requireInternalStaff();
  const conds: SQL[] = [
    inArray(jobRequisitions.status, [...CAMPAIGNABLE_JOB_STATUSES]),
    isNull(jobRequisitions.archivedAt),
    isNull(employers.archivedAt),
  ];
  if (employerId) conds.push(eq(jobRequisitions.employerId, employerId));
  return db
    .select({
      id: jobRequisitions.id,
      title: jobRequisitions.title,
      employerId: employers.id,
      employerName: employers.legalName,
      status: jobRequisitions.status,
    })
    .from(jobRequisitions)
    .innerJoin(employers, eq(employers.id, jobRequisitions.employerId))
    .where(and(...conds))
    .orderBy(employers.legalName, jobRequisitions.title)
    .limit(300);
}

/* ─── Campaign writes ──────────────────────────────────────────────── */

async function lockCampaign(tx: DbExecutor, id: string): Promise<RecruitmentCampaign> {
  const [row] = await tx
    .select()
    .from(recruitmentCampaigns)
    .where(eq(recruitmentCampaigns.id, id))
    .for('update')
    .limit(1);
  if (!row) throw new BusinessRuleError('CAMPAIGN_NOT_FOUND', 'Campaign not found');
  return row;
}

/**
 * Validates the job a campaign is linked to. The campaign stores only the
 * job; its employer is always the job's employer. An employerId sent by a
 * client is accepted only as a cross-check: it must match the job's
 * employer, and is refused without a job (owner decision 7 — there are no
 * employer-only campaigns).
 */
async function resolveCampaignJob(
  tx: DbExecutor,
  jobRequisitionId: string | null,
  employerId: string | null,
): Promise<{
  id: string;
  status: string;
  employerId: string;
  ineligible: JobIneligibility | null;
} | null> {
  if (!jobRequisitionId) {
    if (employerId) {
      throw new ValidationError('Choose the job for this employer', {
        jobRequisitionId: 'Choose the job for this employer, or make it a talent-pool campaign',
      });
    }
    return null;
  }
  const [job] = await tx
    .select({
      id: jobRequisitions.id,
      employerId: jobRequisitions.employerId,
      status: jobRequisitions.status,
      archivedAt: jobRequisitions.archivedAt,
      employerArchivedAt: employers.archivedAt,
    })
    .from(jobRequisitions)
    .innerJoin(employers, eq(employers.id, jobRequisitions.employerId))
    .where(eq(jobRequisitions.id, jobRequisitionId))
    .limit(1);
  if (!job) throw new BusinessRuleError('REQUISITION_NOT_FOUND', 'Job not found');
  if (employerId && employerId !== job.employerId) {
    throw new BusinessRuleError(
      'CAMPAIGN_EMPLOYER_MISMATCH',
      'That job belongs to a different employer',
    );
  }
  return {
    id: job.id,
    status: job.status,
    employerId: job.employerId,
    ineligible: jobIneligibility(job),
  };
}

/** Refuse a job that fails the shared "can be advertised" rule. */
function assertJobAdvertisable(job: { ineligible: JobIneligibility | null } | null): void {
  if (job?.ineligible) {
    throw new BusinessRuleError(job.ineligible.code, jobIneligibleMessage(job.ineligible.reason));
  }
}

/** Create (as DRAFT) or edit a campaign's details. Status changes go through transitionCampaign. */
export async function saveCampaign(input: SaveCampaignInput): Promise<RecruitmentCampaign> {
  const d = parseOrThrow(SaveCampaignSchema, input, 'Invalid campaign');
  const session = await requirePermission('recruitment', 'campaigns', d.id ? 'edit' : 'create');
  const jobId = blankToNull(d.jobRequisitionId);
  const employerId = blankToNull(d.employerId);
  const notes = blankToNull(d.notes);

  return db.transaction(async (tx) => {
    if (!d.id) {
      assertJobAdvertisable(await resolveCampaignJob(tx, jobId, employerId));
      const [created] = await tx
        .insert(recruitmentCampaigns)
        .values({ name: d.name, jobRequisitionId: jobId, notes, status: 'DRAFT' })
        .returning();
      if (!created) throw new Error('insert returned no row');
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'recruitment_campaign',
        entityId: created.id,
        action: 'CREATED',
        after: { name: created.name, status: created.status, jobRequisitionId: jobId },
      });
      return created;
    }

    const before = await lockCampaign(tx, d.id);
    if (before.archivedAt) {
      throw new BusinessRuleError('CAMPAIGN_ARCHIVED', 'Restore the campaign before editing it');
    }
    const jobChanged = (before.jobRequisitionId ?? null) !== jobId;
    if (jobChanged) {
      if ((ENDED_CAMPAIGN as readonly string[]).includes(before.status)) {
        throw new BusinessRuleError(
          'CAMPAIGN_JOB_LOCKED',
          'The job of a finished campaign cannot be changed',
        );
      }
      const [prospects] = await tx
        .select({ n: sql<number>`COUNT(*)::int` })
        .from(recruitmentProspects)
        .innerJoin(advertisements, eq(advertisements.id, recruitmentProspects.advertisementId))
        .where(eq(advertisements.campaignId, before.id));
      if ((prospects?.n ?? 0) > 0) {
        throw new BusinessRuleError(
          'CAMPAIGN_JOB_LOCKED',
          'This campaign already has prospects, so its job cannot be changed. Start a new campaign instead.',
        );
      }
      assertJobAdvertisable(await resolveCampaignJob(tx, jobId, employerId));
    } else if (employerId) {
      await resolveCampaignJob(tx, jobId, employerId);
    }
    if (before.name === d.name && (before.notes ?? null) === notes && !jobChanged) {
      return before;
    }
    const [after] = await tx
      .update(recruitmentCampaigns)
      .set({ name: d.name, notes, jobRequisitionId: jobId, updatedAt: sql`NOW()` })
      .where(eq(recruitmentCampaigns.id, d.id))
      .returning();
    if (!after) throw new Error('update returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'recruitment_campaign',
      entityId: after.id,
      action: 'UPDATED',
      before: { name: before.name, notes: before.notes, jobRequisitionId: before.jobRequisitionId },
      after: { name: after.name, notes: after.notes, jobRequisitionId: after.jobRequisitionId },
    });
    return after;
  });
}

/**
 * Activate / pause / resume / complete / cancel.
 *  - Pausing suspends the campaign's running ads (ACTIVE → PAUSED, audited).
 *  - Resuming (PAUSED → ACTIVE) changes no ads: each is reactivated by hand.
 *  - Ending (COMPLETED / CANCELLED) closes every ad still open, paused ones
 *    included (each close audited).
 */
export async function transitionCampaign(
  input: TransitionCampaignInput,
): Promise<RecruitmentCampaign> {
  const d = parseOrThrow(TransitionCampaignSchema, input, 'Invalid status change');
  const session = await requirePermission('recruitment', 'campaigns', 'edit');
  return db.transaction(async (tx) => {
    const before = await lockCampaign(tx, d.campaignId);
    if (before.archivedAt) {
      throw new BusinessRuleError('CAMPAIGN_ARCHIVED', 'Restore the campaign before changing it');
    }
    if (before.status === d.to) {
      throw new BusinessRuleError(
        'CAMPAIGN_ALREADY_IN_STATUS',
        `The campaign is already ${d.to.toLowerCase()}`,
      );
    }
    assertTransition('campaign', before.status, d.to, CAMPAIGN_TRANSITIONS);
    if (d.to === 'ACTIVE' && before.jobRequisitionId) {
      // Activation and resume both need a job that can still be advertised.
      const job = await resolveCampaignJob(tx, before.jobRequisitionId, null);
      if (job?.ineligible) {
        throw new BusinessRuleError(
          job.ineligible.code,
          `The job this campaign targets is ${job.ineligible.reason}, so the campaign cannot be ${
            before.status === 'PAUSED' ? 'resumed' : 'activated'
          }`,
        );
      }
    }
    const now = new Date();
    const [after] = await tx
      .update(recruitmentCampaigns)
      .set({
        status: d.to,
        startedAt: d.to === 'ACTIVE' ? (before.startedAt ?? now) : before.startedAt,
        endedAt: d.to === 'COMPLETED' || d.to === 'CANCELLED' ? now : before.endedAt,
        updatedAt: sql`NOW()`,
      })
      .where(eq(recruitmentCampaigns.id, before.id))
      .returning();
    if (!after) throw new Error('update returned no row');
    const reason = blankToNull(d.reason);
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'recruitment_campaign',
      entityId: after.id,
      action: 'STATUS_CHANGED',
      before: { status: before.status },
      after: { status: after.status },
      context: {
        ...(reason ? { reason } : {}),
        ...(before.status === 'PAUSED' && d.to === 'ACTIVE' ? { resumed: true } : {}),
      },
    });

    if (d.to === 'PAUSED') {
      const suspended = await tx
        .update(advertisements)
        .set({ status: 'PAUSED', updatedAt: sql`NOW()` })
        .where(and(eq(advertisements.campaignId, before.id), eq(advertisements.status, 'ACTIVE')))
        .returning({ id: advertisements.id });
      for (const ad of suspended) {
        await recordAudit(tx, {
          actorUserId: session.user.id,
          entityType: 'advertisement',
          entityId: ad.id,
          action: 'STATUS_CHANGED',
          before: { status: 'ACTIVE' },
          after: { status: 'PAUSED' },
          context: { via: 'campaign_paused' },
        });
      }
    }

    if (d.to === 'COMPLETED' || d.to === 'CANCELLED') {
      const closed = await tx
        .update(advertisements)
        .set({ status: 'CLOSED', updatedAt: sql`NOW()` })
        .where(
          and(
            eq(advertisements.campaignId, before.id),
            inArray(advertisements.status, ['DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED']),
          ),
        )
        .returning({ id: advertisements.id, status: advertisements.status });
      for (const ad of closed) {
        await recordAudit(tx, {
          actorUserId: session.user.id,
          entityType: 'advertisement',
          entityId: ad.id,
          action: 'STATUS_CHANGED',
          after: { status: 'CLOSED' },
          context: { via: 'campaign_ended', campaignStatus: d.to },
        });
        await cancelAdReminderTask(tx, { advertisementId: ad.id, actorUserId: session.user.id });
      }
    }
    return after;
  });
}

export async function archiveCampaign(input: ArchiveCampaignInput): Promise<RecruitmentCampaign> {
  const parsed = parseOrThrow(ArchiveCampaignSchema, input, 'Invalid archive request');
  const session = await requirePermission('recruitment', 'campaigns', 'edit');
  return db.transaction(async (tx) => {
    const before = await lockCampaign(tx, parsed.campaignId);
    if (before.archivedAt) {
      throw new BusinessRuleError('ALREADY_ARCHIVED', 'Campaign is already archived');
    }
    // Active and paused campaigns are still running: end them first.
    if (before.status === 'ACTIVE' || before.status === 'PAUSED') {
      throw new BusinessRuleError(
        'CAMPAIGN_ACTIVE',
        'Complete or cancel the campaign before archiving it',
      );
    }
    const [after] = await tx
      .update(recruitmentCampaigns)
      .set({ archivedAt: new Date(), archivedByUserId: session.user.id, updatedAt: sql`NOW()` })
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
  const parsed = parseOrThrow(UnarchiveCampaignSchema, input, 'Invalid restore request');
  const session = await requirePermission('recruitment', 'campaigns', 'edit');
  return db.transaction(async (tx) => {
    const before = await lockCampaign(tx, parsed.campaignId);
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

/* ─── Advertisement writes ─────────────────────────────────────────── */

export async function upsertAdvertisement(input: UpsertAdInput): Promise<Advertisement> {
  const d = parseOrThrow(UpsertAdSchema, input, 'Invalid advertisement');
  const session = await requirePermission('recruitment', 'campaigns', d.id ? 'edit' : 'create');
  if (d.expiryDate <= d.startDate) {
    throw new ValidationError('Expiry must be after the start date', {
      expiryDate: 'Expiry must be after the start date',
    });
  }
  if (d.reminderOn && (d.reminderOn < d.startDate || d.reminderOn > d.expiryDate)) {
    throw new ValidationError('The reminder must fall between start and expiry', {
      reminderOn: 'The reminder must fall between start and expiry',
    });
  }
  const values = {
    country: d.country,
    platform: blankToNull(d.platform),
    targetApplicants: d.targetApplicants,
    startDate: d.startDate,
    expiryDate: d.expiryDate,
    reminderOn: blankToNull(d.reminderOn),
    status: d.status,
    notes: blankToNull(d.notes),
  };
  return db.transaction(async (tx) => {
    const campaign = await lockCampaign(tx, d.campaignId);
    if (campaign.archivedAt || (ENDED_CAMPAIGN as readonly string[]).includes(campaign.status)) {
      throw new BusinessRuleError(
        'CAMPAIGN_ENDED',
        'This campaign has ended — advertisements can no longer be added or changed',
      );
    }
    if (d.status === 'ACTIVE' && campaign.status !== 'ACTIVE') {
      throw new BusinessRuleError(
        'AD_CAMPAIGN_NOT_ACTIVE',
        campaign.status === 'PAUSED'
          ? 'The campaign is paused — resume it before running an advertisement'
          : 'Activate the campaign before running an advertisement',
      );
    }

    if (d.id) {
      const [before] = await tx
        .select()
        .from(advertisements)
        .where(eq(advertisements.id, d.id))
        .for('update')
        .limit(1);
      if (!before) throw new BusinessRuleError('AD_NOT_FOUND', 'Advertisement not found');
      if (before.campaignId !== d.campaignId) {
        throw new BusinessRuleError(
          'AD_CAMPAIGN_MISMATCH',
          'An advertisement cannot be moved to another campaign',
        );
      }
      if (before.status !== d.status) {
        assertTransition('advertisement', before.status, d.status, ADVERTISEMENT_TRANSITIONS);
      }
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
        action: before.status !== after.status ? 'STATUS_CHANGED' : 'UPDATED',
        before: {
          country: before.country,
          platform: before.platform,
          targetApplicants: before.targetApplicants,
          startDate: before.startDate,
          expiryDate: before.expiryDate,
          status: before.status,
        },
        after: {
          country: after.country,
          platform: after.platform,
          targetApplicants: after.targetApplicants,
          startDate: after.startDate,
          expiryDate: after.expiryDate,
          status: after.status,
        },
      });
      if (after.reminderOn !== before.reminderOn || after.status === 'CLOSED') {
        await cancelAdReminderTask(tx, { advertisementId: after.id, actorUserId: session.user.id });
        if (after.reminderOn && after.status !== 'CLOSED') {
          await ensureAdReminderTask(tx, {
            advertisementId: after.id,
            reminderOn: after.reminderOn,
            actorUserId: session.user.id,
          });
        }
      }
      return after;
    }

    if (d.status !== 'DRAFT' && d.status !== 'ACTIVE') {
      throw new BusinessRuleError(
        'AD_INVALID_STATUS',
        'A new advertisement starts as draft or active',
      );
    }
    const [created] = await tx
      .insert(advertisements)
      .values({ ...values, campaignId: d.campaignId })
      .returning();
    if (!created) throw new Error('insert returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'advertisement',
      entityId: created.id,
      action: 'CREATED',
      after: {
        campaignId: created.campaignId,
        country: created.country,
        platform: created.platform,
        targetApplicants: created.targetApplicants,
        status: created.status,
      },
    });
    if (created.reminderOn) {
      await ensureAdReminderTask(tx, {
        advertisementId: created.id,
        reminderOn: created.reminderOn,
        actorUserId: session.user.id,
      });
    }
    return created;
  });
}

/* ─── Cross-campaign prospect list (/prospects) ────────────────────── */

export type ProspectRow = {
  id: string;
  personId: string;
  advertisementId: string;
  status: 'NEW' | 'SCREENED' | 'CONVERTED_TO_CANDIDATE' | 'RETAINED_IN_POOL' | 'NOT_SUITABLE';
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  personName: string;
  personEmail: string | null;
  personSource: string | null;
  advertisementCountry: string;
  advertisementPlatform: string | null;
  campaignId: string;
  campaignName: string;
  hasCandidateProfile: boolean;
  screenedByName: string | null;
  followUpDueAt: Date | null;
  followUpAssigneeName: string | null;
};

/** Open follow-up task for a prospect (tasks are tagged with the prospect id). */
export const followUpMarker = (prospectId: string) => `Ref: prospect ${prospectId}`;

const followUpDueSql = sql<Date | null>`(SELECT t.due_at FROM tasks t WHERE t.person_id = ${recruitmentProspects.personId} AND t.status IN ('OPEN','IN_PROGRESS') AND t.archived_at IS NULL AND t.description LIKE '%Ref: prospect ' || ${recruitmentProspects.id}::text || '%' ORDER BY t.due_at ASC NULLS LAST LIMIT 1)`;
const followUpAssigneeSql = sql<
  string | null
>`(SELECT u.full_name FROM tasks t JOIN users u ON u.id = t.assigned_user_id WHERE t.person_id = ${recruitmentProspects.personId} AND t.status IN ('OPEN','IN_PROGRESS') AND t.archived_at IS NULL AND t.description LIKE '%Ref: prospect ' || ${recruitmentProspects.id}::text || '%' ORDER BY t.due_at ASC NULLS LAST LIMIT 1)`;

export function prospectSelect() {
  return db
    .select({
      p: recruitmentProspects,
      firstName: persons.firstName,
      lastName: persons.lastName,
      email: persons.email,
      personSource: persons.source,
      country: advertisements.country,
      platform: advertisements.platform,
      campaignId: recruitmentCampaigns.id,
      campaignName: recruitmentCampaigns.name,
      candidateProfileId: candidateProfiles.id,
      screenedByName: users.fullName,
      followUpDueAt: followUpDueSql,
      followUpAssigneeName: followUpAssigneeSql,
    })
    .from(recruitmentProspects)
    .innerJoin(persons, eq(persons.id, recruitmentProspects.personId))
    .innerJoin(advertisements, eq(advertisements.id, recruitmentProspects.advertisementId))
    .innerJoin(recruitmentCampaigns, eq(recruitmentCampaigns.id, advertisements.campaignId))
    .leftJoin(candidateProfiles, eq(candidateProfiles.personId, persons.id))
    .leftJoin(users, eq(users.id, recruitmentProspects.screenedByUserId));
}

type ProspectSelectRow = Awaited<ReturnType<ReturnType<typeof prospectSelect>['execute']>>[number];

export function toProspectRow(r: ProspectSelectRow): ProspectRow {
  return {
    id: r.p.id,
    personId: r.p.personId,
    advertisementId: r.p.advertisementId,
    status: r.p.status,
    notes: r.p.notes,
    createdAt: r.p.createdAt,
    updatedAt: r.p.updatedAt,
    personName: `${r.firstName} ${r.lastName}`,
    personEmail: r.email,
    personSource: r.personSource,
    advertisementCountry: r.country,
    advertisementPlatform: r.platform,
    campaignId: r.campaignId,
    campaignName: r.campaignName,
    hasCandidateProfile: r.candidateProfileId !== null,
    screenedByName: r.screenedByName,
    followUpDueAt: r.followUpDueAt ? new Date(r.followUpDueAt) : null,
    followUpAssigneeName: r.followUpAssigneeName,
  };
}

/** Cross-campaign prospect list. Newest first, capped at 200 rows. */
export async function fetchProspects(
  input: ListProspectsInput = {},
  createdRange?: DateRange,
): Promise<ProspectRow[]> {
  await requirePermission('recruitment', 'prospects', 'view');
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
    createdRange ? dateRangeWhere(recruitmentProspects.createdAt, createdRange) : undefined,
  ].filter((c): c is NonNullable<typeof c> => c !== undefined);
  const rows = await prospectSelect()
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(recruitmentProspects.createdAt))
    .limit(200);
  return rows.map(toProspectRow);
}

/** Prospects of one campaign (campaign workspace). */
export async function fetchCampaignProspects(campaignId: string): Promise<ProspectRow[]> {
  await requireInternalStaff();
  const rows = await prospectSelect()
    .where(eq(advertisements.campaignId, campaignId))
    .orderBy(desc(recruitmentProspects.createdAt));
  return rows.map(toProspectRow);
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
