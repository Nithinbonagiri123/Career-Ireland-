import { and, asc, eq, gte, isNull, lte, or, sql } from 'drizzle-orm';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { type Interview, interviews } from '@/lib/db/schema/interviews_offers';
import { persons } from '@/lib/db/schema/persons';
import { jobApplications, jobRequisitions } from '@/lib/db/schema/recruitment';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import type { AssignmentScope } from '@/lib/scope';
import { assertTransition, INTERVIEW_TRANSITIONS } from '@/lib/state-machine';
import {
  type RemoveInterviewInput,
  RemoveInterviewSchema,
  type RescheduleInterviewInput,
  RescheduleInterviewSchema,
  type ScheduleInterviewInput,
  ScheduleInterviewSchema,
  type UpdateInterviewInput,
  UpdateInterviewSchema,
} from './schemas';

function blankToNull(v: string | undefined | null): string | null {
  return v && v.trim().length > 0 ? v : null;
}

export async function listInterviewsForApplication(jobApplicationId: string): Promise<Interview[]> {
  await requireRole(['ADMIN', 'STAFF']);
  return db
    .select()
    .from(interviews)
    .where(eq(interviews.jobApplicationId, jobApplicationId))
    .orderBy(asc(interviews.scheduledAt));
}

export type UpcomingInterview = Interview & {
  candidateName: string;
  candidatePersonId: string;
  jobLabel: string;
  employerLabel: string | null;
  requisitionId: string | null;
  isExternal: boolean;
};

/**
 * Interviews within a window (default: from -1d to +60d) — the recruiter's
 * "what's coming up" surface. Scope filter narrows to interviews scheduled by
 * the current user, or those on requisitions assigned to them.
 */
export async function listUpcomingInterviews(opts?: {
  scope?: AssignmentScope;
  fromDate?: Date;
  toDate?: Date;
}): Promise<UpcomingInterview[]> {
  const session = await requireRole(['ADMIN', 'STAFF']);
  const scope = opts?.scope ?? 'all';

  const now = new Date();
  const fromDate = opts?.fromDate ?? new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const toDate = opts?.toDate ?? new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  const timeWindow = and(
    gte(interviews.scheduledAt, fromDate),
    lte(interviews.scheduledAt, toDate),
  );

  let scopePredicate: ReturnType<typeof and> | undefined;
  if (scope === 'mine') {
    scopePredicate = or(
      eq(interviews.scheduledByUserId, session.user.id),
      eq(jobRequisitions.assignedUserId, session.user.id),
    );
  } else if (scope === 'unassigned') {
    scopePredicate = and(
      isNull(interviews.scheduledByUserId),
      isNull(jobRequisitions.assignedUserId),
    );
  }

  const rows = await db
    .select({
      iv: interviews,
      candidateFirst: persons.firstName,
      candidateLast: persons.lastName,
      candidatePersonId: persons.id,
      requisitionId: jobRequisitions.id,
      requisitionTitle: jobRequisitions.title,
      applicationSource: jobApplications.source,
      externalCompany: jobApplications.externalCompanyName,
      externalJobTitle: jobApplications.externalJobTitle,
    })
    .from(interviews)
    .innerJoin(jobApplications, eq(jobApplications.id, interviews.jobApplicationId))
    .innerJoin(persons, eq(persons.id, jobApplications.personId))
    .leftJoin(jobRequisitions, eq(jobRequisitions.id, jobApplications.jobRequisitionId))
    .where(scopePredicate ? and(timeWindow, scopePredicate) : timeWindow)
    .orderBy(asc(interviews.scheduledAt));

  return rows.map((r) => {
    const isExternal = r.applicationSource !== 'INTERNAL';
    return {
      ...r.iv,
      candidateName: `${r.candidateFirst} ${r.candidateLast}`,
      candidatePersonId: r.candidatePersonId,
      jobLabel: isExternal
        ? (r.externalJobTitle ?? r.externalCompany ?? 'External application')
        : (r.requisitionTitle ?? 'Requisition'),
      employerLabel: isExternal ? r.externalCompany : null,
      requisitionId: r.requisitionId,
      isExternal,
    };
  });
}

export async function scheduleInterview(input: ScheduleInterviewInput): Promise<Interview> {
  const session = await requireRole(['ADMIN', 'STAFF']);
  const parsed = ScheduleInterviewSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid interview',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const d = parsed.data;
  const scheduledAt = new Date(d.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime())) {
    throw new ValidationError('Invalid interview', { scheduledAt: 'Invalid date/time' });
  }

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(interviews)
      .values({
        jobApplicationId: d.jobApplicationId,
        scheduledAt,
        durationMinutes: d.durationMinutes ?? null,
        mode: d.mode,
        round: d.round,
        location: blankToNull(d.location ?? undefined),
        interviewerNames: blankToNull(d.interviewerNames ?? undefined),
        scheduledByUserId: session.user.id,
        status: 'SCHEDULED',
        outcome: 'PENDING',
        notes: blankToNull(d.notes ?? undefined),
      })
      .returning();
    if (!row) throw new Error('insert returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'interview',
      entityId: row.id,
      action: 'CREATED',
      after: {
        jobApplicationId: row.jobApplicationId,
        scheduledAt: row.scheduledAt,
        mode: row.mode,
        round: row.round,
      },
    });
    return row;
  });
}

export async function updateInterview(input: UpdateInterviewInput): Promise<Interview> {
  const session = await requireRole(['ADMIN', 'STAFF']);
  const parsed = UpdateInterviewSchema.parse(input);
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(interviews)
      .where(eq(interviews.id, parsed.id))
      .limit(1);
    if (!before) throw new BusinessRuleError('INTERVIEW_NOT_FOUND', 'Interview not found');

    if (before.status !== parsed.status) {
      assertTransition('interview', before.status, parsed.status, INTERVIEW_TRANSITIONS);
    }

    const [after] = await tx
      .update(interviews)
      .set({
        status: parsed.status,
        outcome: parsed.outcome,
        notes: blankToNull(parsed.notes ?? undefined) ?? before.notes,
        updatedAt: sql`NOW()`,
      })
      .where(eq(interviews.id, parsed.id))
      .returning();
    if (!after) throw new Error('update returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'interview',
      entityId: after.id,
      action: 'UPDATED',
      before: { status: before.status, outcome: before.outcome },
      after: { status: after.status, outcome: after.outcome },
    });
    return after;
  });
}

export async function rescheduleInterview(input: RescheduleInterviewInput): Promise<Interview> {
  const session = await requireRole(['ADMIN', 'STAFF']);
  const parsed = RescheduleInterviewSchema.parse(input);
  const scheduledAt = new Date(parsed.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime())) {
    throw new ValidationError('Invalid interview', { scheduledAt: 'Invalid date/time' });
  }
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(interviews)
      .where(eq(interviews.id, parsed.id))
      .limit(1);
    if (!before) throw new BusinessRuleError('INTERVIEW_NOT_FOUND', 'Interview not found');
    if (before.status === 'COMPLETED' || before.status === 'CANCELLED') {
      throw new BusinessRuleError(
        'INTERVIEW_TERMINAL',
        `Cannot reschedule a ${before.status.toLowerCase()} interview`,
      );
    }
    const [after] = await tx
      .update(interviews)
      .set({
        scheduledAt,
        location: blankToNull(parsed.location ?? undefined) ?? before.location,
        status: 'SCHEDULED',
        updatedAt: sql`NOW()`,
      })
      .where(eq(interviews.id, parsed.id))
      .returning();
    if (!after) throw new Error('update returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'interview',
      entityId: after.id,
      action: 'RESCHEDULED',
      before: { scheduledAt: before.scheduledAt, status: before.status },
      after: { scheduledAt: after.scheduledAt, status: after.status },
    });
    return after;
  });
}

export async function removeInterview(input: RemoveInterviewInput): Promise<void> {
  const session = await requireRole(['ADMIN', 'STAFF']);
  const parsed = RemoveInterviewSchema.parse(input);
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(interviews)
      .where(eq(interviews.id, parsed.id))
      .limit(1);
    if (!before) return;
    await tx.delete(interviews).where(eq(interviews.id, parsed.id));
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'interview',
      entityId: before.id,
      action: 'DELETED',
      before: {
        jobApplicationId: before.jobApplicationId,
        scheduledAt: before.scheduledAt,
      },
    });
  });
}
