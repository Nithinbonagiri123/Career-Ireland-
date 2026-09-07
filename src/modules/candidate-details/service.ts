import { and, asc, desc, eq } from 'drizzle-orm';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireInternalStaff } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import {
  type CandidateQualification,
  type CandidateSkill,
  candidateQualifications,
  candidateSkills,
  type EmploymentHistory,
  employmentHistory,
} from '@/lib/db/schema/candidate_details';
import { qualifications, skills } from '@/lib/db/schema/reference';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import {
  type AddCandidateQualificationInput,
  AddCandidateQualificationSchema,
  type AddCandidateSkillInput,
  AddCandidateSkillSchema,
  type RemoveCandidateQualificationInput,
  RemoveCandidateQualificationSchema,
  type RemoveCandidateSkillInput,
  RemoveCandidateSkillSchema,
  type RemoveEmploymentHistoryInput,
  RemoveEmploymentHistorySchema,
  type UpdateCandidateQualificationInput,
  UpdateCandidateQualificationSchema,
  type UpdateCandidateSkillInput,
  UpdateCandidateSkillSchema,
  type UpsertEmploymentHistoryInput,
  UpsertEmploymentHistorySchema,
} from './schemas';

function blankToNull(v: string | undefined | null): string | null {
  return v && v.trim().length > 0 ? v : null;
}

// ─── Skills ───────────────────────────────────────────────────────────────────

export type CandidateSkillRow = CandidateSkill & { skillName: string };

export async function listCandidateSkills(personId: string): Promise<CandidateSkillRow[]> {
  await requireInternalStaff();
  const rows = await db
    .select({ skill: candidateSkills, name: skills.name })
    .from(candidateSkills)
    .innerJoin(skills, eq(skills.id, candidateSkills.skillId))
    .where(eq(candidateSkills.personId, personId))
    .orderBy(asc(skills.name));
  return rows.map((r) => ({ ...r.skill, skillName: r.name }));
}

export async function addCandidateSkill(input: AddCandidateSkillInput): Promise<CandidateSkill> {
  const session = await requireInternalStaff();
  const parsed = AddCandidateSkillSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid skill',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const d = parsed.data;
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(candidateSkills)
      .where(and(eq(candidateSkills.personId, d.personId), eq(candidateSkills.skillId, d.skillId)))
      .limit(1);
    if (existing) {
      throw new BusinessRuleError('SKILL_ALREADY_ADDED', 'This skill is already recorded');
    }
    const [row] = await tx
      .insert(candidateSkills)
      .values({
        personId: d.personId,
        skillId: d.skillId,
        proficiency: d.proficiency,
        yearsExperience: d.yearsExperience ?? null,
        notes: blankToNull(d.notes ?? undefined),
      })
      .returning();
    if (!row) throw new Error('insert returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'candidate_skill',
      entityId: row.id,
      action: 'CREATED',
      after: { personId: row.personId, skillId: row.skillId, proficiency: row.proficiency },
    });
    return row;
  });
}

export async function updateCandidateSkill(
  input: UpdateCandidateSkillInput,
): Promise<CandidateSkill> {
  const session = await requireInternalStaff();
  const parsed = UpdateCandidateSkillSchema.parse(input);
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(candidateSkills)
      .where(eq(candidateSkills.id, parsed.id))
      .limit(1);
    if (!before) throw new BusinessRuleError('SKILL_NOT_FOUND', 'Skill entry not found');
    const [after] = await tx
      .update(candidateSkills)
      .set({
        proficiency: parsed.proficiency,
        yearsExperience: parsed.yearsExperience ?? null,
        notes: blankToNull(parsed.notes ?? undefined),
      })
      .where(eq(candidateSkills.id, parsed.id))
      .returning();
    if (!after) throw new Error('update returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'candidate_skill',
      entityId: after.id,
      action: 'UPDATED',
      before: { proficiency: before.proficiency, yearsExperience: before.yearsExperience },
      after: { proficiency: after.proficiency, yearsExperience: after.yearsExperience },
    });
    return after;
  });
}

export async function removeCandidateSkill(input: RemoveCandidateSkillInput): Promise<void> {
  const session = await requireInternalStaff();
  const parsed = RemoveCandidateSkillSchema.parse(input);
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(candidateSkills)
      .where(eq(candidateSkills.id, parsed.id))
      .limit(1);
    if (!before) return;
    await tx.delete(candidateSkills).where(eq(candidateSkills.id, parsed.id));
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'candidate_skill',
      entityId: before.id,
      action: 'DELETED',
      before: { skillId: before.skillId, personId: before.personId },
    });
  });
}

// ─── Qualifications ───────────────────────────────────────────────────────────

export type CandidateQualificationRow = CandidateQualification & { qualificationName: string };

export async function listCandidateQualifications(
  personId: string,
): Promise<CandidateQualificationRow[]> {
  await requireInternalStaff();
  const rows = await db
    .select({ q: candidateQualifications, name: qualifications.name })
    .from(candidateQualifications)
    .innerJoin(qualifications, eq(qualifications.id, candidateQualifications.qualificationId))
    .where(eq(candidateQualifications.personId, personId))
    .orderBy(desc(candidateQualifications.awardedOn));
  return rows.map((r) => ({ ...r.q, qualificationName: r.name }));
}

export async function addCandidateQualification(
  input: AddCandidateQualificationInput,
): Promise<CandidateQualification> {
  const session = await requireInternalStaff();
  const parsed = AddCandidateQualificationSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid qualification',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const d = parsed.data;
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(candidateQualifications)
      .where(
        and(
          eq(candidateQualifications.personId, d.personId),
          eq(candidateQualifications.qualificationId, d.qualificationId),
        ),
      )
      .limit(1);
    if (existing) {
      throw new BusinessRuleError(
        'QUALIFICATION_ALREADY_ADDED',
        'This qualification is already recorded',
      );
    }
    const [row] = await tx
      .insert(candidateQualifications)
      .values({
        personId: d.personId,
        qualificationId: d.qualificationId,
        awardedOn: blankToNull(d.awardedOn ?? undefined),
        institution: blankToNull(d.institution ?? undefined),
        referenceNumber: blankToNull(d.referenceNumber ?? undefined),
        notes: blankToNull(d.notes ?? undefined),
      })
      .returning();
    if (!row) throw new Error('insert returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'candidate_qualification',
      entityId: row.id,
      action: 'CREATED',
      after: { personId: row.personId, qualificationId: row.qualificationId },
    });
    return row;
  });
}

export async function updateCandidateQualification(
  input: UpdateCandidateQualificationInput,
): Promise<CandidateQualification> {
  const session = await requireInternalStaff();
  const parsed = UpdateCandidateQualificationSchema.parse(input);
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(candidateQualifications)
      .where(eq(candidateQualifications.id, parsed.id))
      .limit(1);
    if (!before)
      throw new BusinessRuleError('QUALIFICATION_NOT_FOUND', 'Qualification entry not found');
    const [after] = await tx
      .update(candidateQualifications)
      .set({
        awardedOn: blankToNull(parsed.awardedOn ?? undefined),
        institution: blankToNull(parsed.institution ?? undefined),
        referenceNumber: blankToNull(parsed.referenceNumber ?? undefined),
        notes: blankToNull(parsed.notes ?? undefined),
      })
      .where(eq(candidateQualifications.id, parsed.id))
      .returning();
    if (!after) throw new Error('update returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'candidate_qualification',
      entityId: after.id,
      action: 'UPDATED',
    });
    return after;
  });
}

export async function removeCandidateQualification(
  input: RemoveCandidateQualificationInput,
): Promise<void> {
  const session = await requireInternalStaff();
  const parsed = RemoveCandidateQualificationSchema.parse(input);
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(candidateQualifications)
      .where(eq(candidateQualifications.id, parsed.id))
      .limit(1);
    if (!before) return;
    await tx.delete(candidateQualifications).where(eq(candidateQualifications.id, parsed.id));
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'candidate_qualification',
      entityId: before.id,
      action: 'DELETED',
      before: { qualificationId: before.qualificationId, personId: before.personId },
    });
  });
}

// ─── Employment history ───────────────────────────────────────────────────────

export async function listEmploymentHistory(personId: string): Promise<EmploymentHistory[]> {
  await requireInternalStaff();
  return db
    .select()
    .from(employmentHistory)
    .where(eq(employmentHistory.personId, personId))
    .orderBy(desc(employmentHistory.startDate));
}

export async function upsertEmploymentHistory(
  input: UpsertEmploymentHistoryInput,
): Promise<EmploymentHistory> {
  const session = await requireInternalStaff();
  const parsed = UpsertEmploymentHistorySchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid employment history entry',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const d = parsed.data;
  const values = {
    personId: d.personId,
    employerName: d.employerName,
    jobTitle: blankToNull(d.jobTitle ?? undefined),
    location: blankToNull(d.location ?? undefined),
    startDate: blankToNull(d.startDate ?? undefined),
    endDate: d.isCurrent ? null : blankToNull(d.endDate ?? undefined),
    isCurrent: d.isCurrent,
    description: blankToNull(d.description ?? undefined),
  };
  return db.transaction(async (tx) => {
    if (d.id) {
      const [before] = await tx
        .select()
        .from(employmentHistory)
        .where(eq(employmentHistory.id, d.id))
        .limit(1);
      if (!before) throw new BusinessRuleError('EMP_HISTORY_NOT_FOUND', 'Entry not found');
      const [after] = await tx
        .update(employmentHistory)
        .set(values)
        .where(eq(employmentHistory.id, d.id))
        .returning();
      if (!after) throw new Error('update returned no row');
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'employment_history',
        entityId: after.id,
        action: 'UPDATED',
        before: { employerName: before.employerName, jobTitle: before.jobTitle },
        after: { employerName: after.employerName, jobTitle: after.jobTitle },
      });
      return after;
    }
    const [row] = await tx.insert(employmentHistory).values(values).returning();
    if (!row) throw new Error('insert returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'employment_history',
      entityId: row.id,
      action: 'CREATED',
      after: { personId: row.personId, employerName: row.employerName },
    });
    return row;
  });
}

export async function removeEmploymentHistory(input: RemoveEmploymentHistoryInput): Promise<void> {
  const session = await requireInternalStaff();
  const parsed = RemoveEmploymentHistorySchema.parse(input);
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(employmentHistory)
      .where(eq(employmentHistory.id, parsed.id))
      .limit(1);
    if (!before) return;
    await tx.delete(employmentHistory).where(eq(employmentHistory.id, parsed.id));
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'employment_history',
      entityId: before.id,
      action: 'DELETED',
      before: { employerName: before.employerName, personId: before.personId },
    });
  });
}
