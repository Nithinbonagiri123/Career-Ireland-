import { and, asc, desc, eq, isNull, type SQL, sql } from 'drizzle-orm';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireInternalStaff } from '@/lib/auth/session';
import { type DateRange, dateRangeWhere } from '@/lib/date-range';
import { db } from '@/lib/db/client';
import {
  employers,
  type JobRequisition,
  jobRequisitions,
  type RequisitionQualification,
  type RequisitionSkill,
  requisitionQualifications,
  requisitionSkills,
} from '@/lib/db/schema/recruitment';
import { qualifications, skills } from '@/lib/db/schema/reference';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import { type AssignmentScope, assignmentCondition } from '@/lib/scope';
import { assertTransition, REQUISITION_TRANSITIONS } from '@/lib/state-machine';
import {
  type ArchiveRequisitionInput,
  ArchiveRequisitionSchema,
  type AttachRequisitionQualificationInput,
  AttachRequisitionQualificationSchema,
  type AttachRequisitionSkillInput,
  AttachRequisitionSkillSchema,
  type DetachRequisitionQualificationInput,
  DetachRequisitionQualificationSchema,
  type DetachRequisitionSkillInput,
  DetachRequisitionSkillSchema,
  type UnarchiveRequisitionInput,
  UnarchiveRequisitionSchema,
  type UpdateStatusInput,
  UpdateStatusSchema,
  type UpsertRequisitionInput,
  UpsertRequisitionSchema,
} from './schemas';

function blankToNull(v: string | undefined | null): string | null {
  return v && v.trim().length > 0 ? v : null;
}

export type RequisitionListRow = JobRequisition & {
  employerName: string;
};

export async function fetchRequisitionsForEmployer(
  employerId: string,
): Promise<RequisitionListRow[]> {
  await requireInternalStaff();
  const rows = await db
    .select({ requisition: jobRequisitions, employerName: employers.legalName })
    .from(jobRequisitions)
    .innerJoin(employers, eq(employers.id, jobRequisitions.employerId))
    .where(and(eq(jobRequisitions.employerId, employerId), isNull(jobRequisitions.archivedAt)))
    .orderBy(desc(jobRequisitions.createdAt));
  return rows.map((r) => ({ ...r.requisition, employerName: r.employerName }));
}

export async function fetchRequisitions(
  scope?: AssignmentScope,
  createdRange?: DateRange,
): Promise<RequisitionListRow[]> {
  const session = await requireInternalStaff();
  const scopeCond = scope
    ? assignmentCondition(scope, jobRequisitions.assignedUserId, session.user.id)
    : undefined;
  const createdCond = createdRange
    ? dateRangeWhere(jobRequisitions.createdAt, createdRange)
    : undefined;
  // Archived requisitions are hidden from the standard list. A dedicated
  // "Show archived" filter can be added later.
  const whereConds: SQL[] = [isNull(jobRequisitions.archivedAt)];
  if (scopeCond) whereConds.push(scopeCond);
  if (createdCond) whereConds.push(createdCond);
  const rows = await db
    .select({
      requisition: jobRequisitions,
      employerName: employers.legalName,
    })
    .from(jobRequisitions)
    .innerJoin(employers, eq(employers.id, jobRequisitions.employerId))
    .where(and(...whereConds))
    .orderBy(desc(jobRequisitions.createdAt));
  return rows.map((r) => ({ ...r.requisition, employerName: r.employerName }));
}

export async function fetchRequisition(id: string): Promise<RequisitionListRow | null> {
  await requireInternalStaff();
  const [row] = await db
    .select({
      requisition: jobRequisitions,
      employerName: employers.legalName,
    })
    .from(jobRequisitions)
    .innerJoin(employers, eq(employers.id, jobRequisitions.employerId))
    .where(eq(jobRequisitions.id, id))
    .limit(1);
  return row ? { ...row.requisition, employerName: row.employerName } : null;
}

export async function upsertRequisition(input: UpsertRequisitionInput): Promise<JobRequisition> {
  const session = await requireInternalStaff();
  const parsed = UpsertRequisitionSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid requisition',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const d = parsed.data;
  const values = {
    employerId: d.employerId,
    primaryContactId: blankToNull(d.primaryContactId) ?? undefined,
    title: d.title,
    occupationId: blankToNull(d.occupationId) ?? undefined,
    positionsRequired: d.positionsRequired,
    location: blankToNull(d.location),
    employmentType: d.employmentType,
    salaryMin: blankToNull(d.salaryMin),
    salaryMax: blankToNull(d.salaryMax),
    salaryCurrencyCode: blankToNull(d.salaryCurrencyCode) ?? undefined,
    description: blankToNull(d.description),
    candidateRequirements: blankToNull(d.candidateRequirements),
    status: d.status,
    assignedUserId: blankToNull(d.assignedUserId) ?? undefined,
    targetFillDate: blankToNull(d.targetFillDate),
  };

  return db.transaction(async (tx) => {
    if (d.id) {
      const [before] = await tx
        .select()
        .from(jobRequisitions)
        .where(eq(jobRequisitions.id, d.id))
        .limit(1);
      if (!before) throw new BusinessRuleError('REQUISITION_NOT_FOUND', 'Requisition not found');
      const [after] = await tx
        .update(jobRequisitions)
        .set({ ...values, updatedAt: sql`NOW()` })
        .where(eq(jobRequisitions.id, d.id))
        .returning();
      if (!after) throw new Error('update returned no row');
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'job_requisition',
        entityId: after.id,
        action: 'UPDATED',
        before: { title: before.title, status: before.status },
        after: { title: after.title, status: after.status },
      });
      return after;
    }
    const [created] = await tx.insert(jobRequisitions).values(values).returning();
    if (!created) throw new Error('insert returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'job_requisition',
      entityId: created.id,
      action: 'CREATED',
      after: {
        employerId: created.employerId,
        title: created.title,
        positionsRequired: created.positionsRequired,
      },
    });
    return created;
  });
}

export async function updateRequisitionStatus(input: UpdateStatusInput): Promise<JobRequisition> {
  const session = await requireInternalStaff();
  const parsed = UpdateStatusSchema.parse(input);
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(jobRequisitions)
      .where(eq(jobRequisitions.id, parsed.requisitionId))
      .limit(1);
    if (!before) throw new BusinessRuleError('REQUISITION_NOT_FOUND', 'Requisition not found');
    if (before.status === parsed.status) return before;
    assertTransition('requisition', before.status, parsed.status, REQUISITION_TRANSITIONS);
    const [after] = await tx
      .update(jobRequisitions)
      .set({ status: parsed.status, updatedAt: sql`NOW()` })
      .where(eq(jobRequisitions.id, parsed.requisitionId))
      .returning();
    if (!after) throw new Error('update returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'job_requisition',
      entityId: after.id,
      action: 'STATUS_CHANGED',
      before: { status: before.status },
      after: { status: after.status },
    });
    return after;
  });
}

// ─── Requisition skills ───────────────────────────────────────────────────────

export type RequisitionSkillRow = RequisitionSkill & { skillName: string };

export async function listRequisitionSkills(requisitionId: string): Promise<RequisitionSkillRow[]> {
  await requireInternalStaff();
  const rows = await db
    .select({ rs: requisitionSkills, name: skills.name })
    .from(requisitionSkills)
    .innerJoin(skills, eq(skills.id, requisitionSkills.skillId))
    .where(eq(requisitionSkills.jobRequisitionId, requisitionId))
    .orderBy(desc(requisitionSkills.isRequired), desc(requisitionSkills.weight), asc(skills.name));
  return rows.map((r) => ({ ...r.rs, skillName: r.name }));
}

export async function attachRequisitionSkill(
  input: AttachRequisitionSkillInput,
): Promise<RequisitionSkill> {
  const session = await requireInternalStaff();
  const parsed = AttachRequisitionSkillSchema.parse(input);
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(requisitionSkills)
      .where(
        and(
          eq(requisitionSkills.jobRequisitionId, parsed.jobRequisitionId),
          eq(requisitionSkills.skillId, parsed.skillId),
        ),
      )
      .limit(1);
    if (existing) {
      const [updated] = await tx
        .update(requisitionSkills)
        .set({ isRequired: parsed.isRequired, weight: parsed.weight })
        .where(
          and(
            eq(requisitionSkills.jobRequisitionId, parsed.jobRequisitionId),
            eq(requisitionSkills.skillId, parsed.skillId),
          ),
        )
        .returning();
      if (!updated) throw new Error('update returned no row');
      return updated;
    }
    const [row] = await tx.insert(requisitionSkills).values(parsed).returning();
    if (!row) throw new Error('insert returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'requisition_skill',
      entityId: parsed.jobRequisitionId,
      action: 'SKILL_ATTACHED',
      after: {
        skillId: parsed.skillId,
        isRequired: parsed.isRequired,
        weight: parsed.weight,
      },
    });
    return row;
  });
}

export async function detachRequisitionSkill(input: DetachRequisitionSkillInput): Promise<void> {
  const session = await requireInternalStaff();
  const parsed = DetachRequisitionSkillSchema.parse(input);
  await db.transaction(async (tx) => {
    await tx
      .delete(requisitionSkills)
      .where(
        and(
          eq(requisitionSkills.jobRequisitionId, parsed.jobRequisitionId),
          eq(requisitionSkills.skillId, parsed.skillId),
        ),
      );
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'requisition_skill',
      entityId: parsed.jobRequisitionId,
      action: 'SKILL_DETACHED',
      before: { skillId: parsed.skillId },
    });
  });
}

// ─── Requisition qualifications ───────────────────────────────────────────────

export type RequisitionQualificationRow = RequisitionQualification & { qualificationName: string };

export async function listRequisitionQualifications(
  requisitionId: string,
): Promise<RequisitionQualificationRow[]> {
  await requireInternalStaff();
  const rows = await db
    .select({ rq: requisitionQualifications, name: qualifications.name })
    .from(requisitionQualifications)
    .innerJoin(qualifications, eq(qualifications.id, requisitionQualifications.qualificationId))
    .where(eq(requisitionQualifications.jobRequisitionId, requisitionId))
    .orderBy(desc(requisitionQualifications.isRequired), asc(qualifications.name));
  return rows.map((r) => ({ ...r.rq, qualificationName: r.name }));
}

export async function attachRequisitionQualification(
  input: AttachRequisitionQualificationInput,
): Promise<RequisitionQualification> {
  const session = await requireInternalStaff();
  const parsed = AttachRequisitionQualificationSchema.parse(input);
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(requisitionQualifications)
      .where(
        and(
          eq(requisitionQualifications.jobRequisitionId, parsed.jobRequisitionId),
          eq(requisitionQualifications.qualificationId, parsed.qualificationId),
        ),
      )
      .limit(1);
    if (existing) {
      const [updated] = await tx
        .update(requisitionQualifications)
        .set({ isRequired: parsed.isRequired })
        .where(
          and(
            eq(requisitionQualifications.jobRequisitionId, parsed.jobRequisitionId),
            eq(requisitionQualifications.qualificationId, parsed.qualificationId),
          ),
        )
        .returning();
      if (!updated) throw new Error('update returned no row');
      return updated;
    }
    const [row] = await tx.insert(requisitionQualifications).values(parsed).returning();
    if (!row) throw new Error('insert returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'requisition_qualification',
      entityId: parsed.jobRequisitionId,
      action: 'QUALIFICATION_ATTACHED',
      after: { qualificationId: parsed.qualificationId, isRequired: parsed.isRequired },
    });
    return row;
  });
}

export async function detachRequisitionQualification(
  input: DetachRequisitionQualificationInput,
): Promise<void> {
  const session = await requireInternalStaff();
  const parsed = DetachRequisitionQualificationSchema.parse(input);
  await db.transaction(async (tx) => {
    await tx
      .delete(requisitionQualifications)
      .where(
        and(
          eq(requisitionQualifications.jobRequisitionId, parsed.jobRequisitionId),
          eq(requisitionQualifications.qualificationId, parsed.qualificationId),
        ),
      );
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'requisition_qualification',
      entityId: parsed.jobRequisitionId,
      action: 'QUALIFICATION_DETACHED',
      before: { qualificationId: parsed.qualificationId },
    });
  });
}

// ─── Archive / unarchive ──────────────────────────────────────────────────────

async function findRequisition(tx: Parameters<typeof recordAudit>[0], id: string) {
  const [row] = await tx.select().from(jobRequisitions).where(eq(jobRequisitions.id, id)).limit(1);
  return row ?? null;
}

/** Soft-archive a requisition. Hidden from lists, matching feeds, and dashboards. */
export async function archiveRequisition(input: ArchiveRequisitionInput): Promise<JobRequisition> {
  const session = await requireInternalStaff();
  const parsed = ArchiveRequisitionSchema.parse(input);
  return db.transaction(async (tx) => {
    const before = await findRequisition(tx, parsed.requisitionId);
    if (!before) throw new BusinessRuleError('REQUISITION_NOT_FOUND', 'Requisition not found');
    if (before.archivedAt) {
      throw new BusinessRuleError('ALREADY_ARCHIVED', 'Requisition is already archived');
    }
    const [after] = await tx
      .update(jobRequisitions)
      .set({
        archivedAt: new Date(),
        archivedByUserId: session.user.id,
        updatedAt: sql`NOW()`,
      })
      .where(eq(jobRequisitions.id, parsed.requisitionId))
      .returning();
    if (!after) throw new Error('archive returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'job_requisition',
      entityId: after.id,
      action: 'ARCHIVED',
      before: { archivedAt: null },
      after: { archivedAt: after.archivedAt },
      context: { reason: parsed.reason },
    });
    return after;
  });
}

export async function unarchiveRequisition(
  input: UnarchiveRequisitionInput,
): Promise<JobRequisition> {
  const session = await requireInternalStaff();
  const parsed = UnarchiveRequisitionSchema.parse(input);
  return db.transaction(async (tx) => {
    const before = await findRequisition(tx, parsed.requisitionId);
    if (!before) throw new BusinessRuleError('REQUISITION_NOT_FOUND', 'Requisition not found');
    if (!before.archivedAt) {
      throw new BusinessRuleError('NOT_ARCHIVED', 'Requisition is not archived');
    }
    const [after] = await tx
      .update(jobRequisitions)
      .set({ archivedAt: null, archivedByUserId: null, updatedAt: sql`NOW()` })
      .where(eq(jobRequisitions.id, parsed.requisitionId))
      .returning();
    if (!after) throw new Error('unarchive returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'job_requisition',
      entityId: after.id,
      action: 'UNARCHIVED',
      before: { archivedAt: before.archivedAt },
      after: { archivedAt: null },
      context: { reason: parsed.reason },
    });
    return after;
  });
}
