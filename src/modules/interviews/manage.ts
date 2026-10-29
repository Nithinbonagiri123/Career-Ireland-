import { and, eq, inArray, max, sql } from 'drizzle-orm';
import { type DbExecutor, recordAudit } from '@/lib/audit/withAudit';
import { requirePermission } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { type Interview, interviews } from '@/lib/db/schema/interviews_offers';
import { jobApplications } from '@/lib/db/schema/recruitment';
import { BusinessRuleError, NotFoundError, ValidationError } from '@/lib/errors';
import {
  APPLICATION_TRANSITIONS,
  assertTransition,
  INTERVIEW_TRANSITIONS,
} from '@/lib/state-machine';
import { BUSINESS_TIMEZONE, formatZoned, zonedLocalToUtc } from '@/lib/zoned-time';
import { assertRequisitionOpen, lockRequisitionApplication } from '@/modules/applications/locks';
import {
  type CancelInterviewInput,
  CancelInterviewSchema,
  type RecordInterviewResultInput,
  RecordInterviewResultSchema,
  type ScheduleInterviewInput,
  ScheduleInterviewSchema,
  type UpdateInterviewFeedbackInput,
  UpdateInterviewFeedbackSchema,
  type UpdateInterviewInput,
  UpdateInterviewSchema,
} from './schemas';

/**
 * R3 — interview management on a job requirement's applications.
 *
 * Authorization: the existing `recruitment.interviews` permission
 * (create to schedule, edit to change / cancel / record results). Every
 * write locks the application row first (lockRequisitionApplication), so
 * double submits and concurrent edits serialize. All changes are audited.
 */

/** Statuses that may move to INTERVIEW when an interview is scheduled
 *  (exactly the APPLICATION_TRANSITIONS edges into INTERVIEW). */
const ADVANCE_TO_INTERVIEW = ['APPLIED', 'UNDER_REVIEW', 'SHORTLISTED'] as const;

function parse<T>(
  schema: {
    safeParse: (v: unknown) => {
      success: boolean;
      data?: T;
      error?: { flatten: () => { fieldErrors: unknown } };
    };
  },
  input: unknown,
  label: string,
): T {
  const r = schema.safeParse(input);
  if (!r.success) {
    throw new ValidationError(label, r.error?.flatten().fieldErrors as Record<string, string>);
  }
  return r.data as T;
}

function toInstant(localDateTime: string, timeZone: string): Date {
  const at = zonedLocalToUtc(localDateTime, timeZone);
  if (!at) {
    throw new ValidationError('That date and time does not exist in the chosen timezone', {
      localDateTime: 'Check the date, time and timezone',
    });
  }
  return at;
}

function assertFuture(at: Date): void {
  if (at.getTime() <= Date.now()) {
    throw new ValidationError('Interviews can only be scheduled in the future', {
      localDateTime: 'Pick a future date and time',
    });
  }
}

/** assertTransition treats same-state as a no-op; R3 actions must change state. */
function assertChanges(entity: string, from: string, to: string): void {
  if (from === to) {
    throw new BusinessRuleError(
      'INVALID_STATE_TRANSITION',
      `This ${entity} is already ${to.replace(/_/g, ' ').toLowerCase()}.`,
    );
  }
}

async function lockInterview(tx: DbExecutor, interviewId: string): Promise<Interview> {
  const [row] = await tx
    .select({ applicationId: interviews.jobApplicationId })
    .from(interviews)
    .where(eq(interviews.id, interviewId))
    .limit(1);
  if (!row) throw new NotFoundError('Interview');
  // Application lock first (same order as scheduling) → no deadlocks.
  await lockRequisitionApplication(tx, row.applicationId);
  const [locked] = await tx
    .select()
    .from(interviews)
    .where(eq(interviews.id, interviewId))
    .for('update')
    .limit(1);
  if (!locked) throw new NotFoundError('Interview');
  return locked;
}

function interviewSnapshot(i: Interview) {
  return {
    scheduledAt: i.scheduledAt.toISOString(),
    durationMinutes: i.durationMinutes,
    mode: i.mode,
    location: i.location,
    interviewerNames: i.interviewerNames,
    status: i.status,
    outcome: i.outcome,
    round: i.round,
  };
}

export async function scheduleInterview(input: ScheduleInterviewInput): Promise<Interview> {
  const session = await requirePermission('recruitment', 'interviews', 'create');
  const d = parse<ReturnType<typeof ScheduleInterviewSchema.parse>>(
    ScheduleInterviewSchema,
    input,
    'Invalid interview',
  );
  const at = toInstant(d.localDateTime, d.timeZone);
  assertFuture(at);

  return db.transaction(async (tx) => {
    const app = await lockRequisitionApplication(tx, d.applicationId);
    assertRequisitionOpen(app.requisitionStatus);
    if (app.status !== 'INTERVIEW') {
      if (!(ADVANCE_TO_INTERVIEW as readonly string[]).includes(app.status)) {
        throw new BusinessRuleError(
          'APPLICATION_NOT_INTERVIEWABLE',
          `Interviews can't be scheduled for an application that is ${app.status.replace(/_/g, ' ').toLowerCase()}.`,
        );
      }
      // Reuses the accepted application state machine; audited as its own event.
      assertTransition('application', app.status, 'INTERVIEW', APPLICATION_TRANSITIONS);
      await tx
        .update(jobApplications)
        .set({ status: 'INTERVIEW', updatedAt: sql`NOW()` })
        .where(eq(jobApplications.id, app.id));
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'job_application',
        entityId: app.id,
        action: 'STATUS_CHANGED',
        before: { status: app.status },
        after: { status: 'INTERVIEW' },
        context: { via: 'interview_scheduled' },
      });
    }

    // Double-submit guard: an identical live slot for this application.
    const [dupe] = await tx
      .select({ id: interviews.id })
      .from(interviews)
      .where(
        and(
          eq(interviews.jobApplicationId, app.id),
          eq(interviews.status, 'SCHEDULED'),
          eq(interviews.scheduledAt, at),
        ),
      )
      .limit(1);
    if (dupe) {
      throw new BusinessRuleError(
        'INTERVIEW_DUPLICATE',
        'An interview is already scheduled for this candidate at that time.',
      );
    }

    const [roundRow] = await tx
      .select({ maxRound: max(interviews.round) })
      .from(interviews)
      .where(
        and(
          eq(interviews.jobApplicationId, app.id),
          inArray(interviews.status, ['SCHEDULED', 'COMPLETED']),
        ),
      );
    const round = (roundRow?.maxRound ?? 0) + 1;

    const [created] = await tx
      .insert(interviews)
      .values({
        jobApplicationId: app.id,
        scheduledAt: at,
        durationMinutes: d.durationMinutes ?? null,
        mode: d.mode,
        round,
        location: d.location ?? null,
        interviewerNames: d.interviewerNames ?? null,
        scheduledByUserId: session.user.id,
        status: 'SCHEDULED',
        outcome: 'PENDING',
        notes: d.notes ?? null,
      })
      .returning();
    if (!created) throw new Error('interview insert returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'interview',
      entityId: created.id,
      action: 'SCHEDULED',
      after: interviewSnapshot(created),
      context: {
        applicationId: app.id,
        jobRequisitionId: app.jobRequisitionId,
        enteredTimeZone: d.timeZone,
        businessTime: formatZoned(at, BUSINESS_TIMEZONE),
      },
    });
    return created;
  });
}

export async function updateInterview(input: UpdateInterviewInput): Promise<Interview> {
  const session = await requirePermission('recruitment', 'interviews', 'edit');
  const d = parse<ReturnType<typeof UpdateInterviewSchema.parse>>(
    UpdateInterviewSchema,
    input,
    'Invalid interview',
  );
  const at = toInstant(d.localDateTime, d.timeZone);

  return db.transaction(async (tx) => {
    const before = await lockInterview(tx, d.interviewId);
    if (before.status !== 'SCHEDULED') {
      throw new BusinessRuleError(
        'INTERVIEW_NOT_EDITABLE',
        'Only scheduled interviews can be edited.',
      );
    }
    if (at.getTime() !== before.scheduledAt.getTime()) assertFuture(at);
    const [after] = await tx
      .update(interviews)
      .set({
        scheduledAt: at,
        durationMinutes: d.durationMinutes ?? null,
        mode: d.mode,
        location: d.location ?? null,
        interviewerNames: d.interviewerNames ?? null,
        notes: d.notes ?? null,
        updatedAt: sql`NOW()`,
      })
      .where(eq(interviews.id, before.id))
      .returning();
    if (!after) throw new Error('interview update returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'interview',
      entityId: after.id,
      action: at.getTime() !== before.scheduledAt.getTime() ? 'RESCHEDULED' : 'UPDATED',
      before: interviewSnapshot(before),
      after: interviewSnapshot(after),
      context: { enteredTimeZone: d.timeZone },
    });
    return after;
  });
}

export async function cancelInterview(input: CancelInterviewInput): Promise<Interview> {
  const session = await requirePermission('recruitment', 'interviews', 'edit');
  const d = parse<ReturnType<typeof CancelInterviewSchema.parse>>(
    CancelInterviewSchema,
    input,
    'Invalid cancellation',
  );
  return db.transaction(async (tx) => {
    const before = await lockInterview(tx, d.interviewId);
    assertChanges('interview', before.status, 'CANCELLED');
    assertTransition('interview', before.status, 'CANCELLED', INTERVIEW_TRANSITIONS);
    const [after] = await tx
      .update(interviews)
      .set({ status: 'CANCELLED', updatedAt: sql`NOW()` })
      .where(eq(interviews.id, before.id))
      .returning();
    if (!after) throw new Error('interview cancel returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'interview',
      entityId: after.id,
      action: 'CANCELLED',
      before: { status: before.status },
      after: { status: after.status },
      context: { reason: d.reason },
    });
    return after;
  });
}

function appendFeedback(
  existing: string | null,
  feedback: string | undefined,
  actorName: string,
): string | null {
  if (!feedback) return existing;
  const stamp = formatZoned(new Date(), BUSINESS_TIMEZONE);
  const entry = `Feedback — ${actorName}, ${stamp}:\n${feedback}`;
  return existing ? `${existing}\n\n${entry}` : entry;
}

export async function recordInterviewResult(input: RecordInterviewResultInput): Promise<Interview> {
  const session = await requirePermission('recruitment', 'interviews', 'edit');
  const d = parse<ReturnType<typeof RecordInterviewResultSchema.parse>>(
    RecordInterviewResultSchema,
    input,
    'Invalid interview result',
  );
  return db.transaction(async (tx) => {
    const before = await lockInterview(tx, d.interviewId);
    assertChanges('interview', before.status, d.result);
    assertTransition('interview', before.status, d.result, INTERVIEW_TRANSITIONS);
    if (before.scheduledAt.getTime() > Date.now()) {
      throw new BusinessRuleError(
        'INTERVIEW_NOT_YET_HELD',
        "This interview hasn't happened yet — record the result after the scheduled time.",
      );
    }
    const [after] = await tx
      .update(interviews)
      .set({
        status: d.result,
        outcome: d.result === 'COMPLETED' ? (d.outcome ?? 'PENDING') : 'PENDING',
        notes: appendFeedback(before.notes, d.feedback, session.user.name || session.user.email),
        updatedAt: sql`NOW()`,
      })
      .where(eq(interviews.id, before.id))
      .returning();
    if (!after) throw new Error('interview result returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'interview',
      entityId: after.id,
      action: d.result === 'COMPLETED' ? 'COMPLETED' : 'NO_SHOW',
      before: { status: before.status, outcome: before.outcome },
      after: { status: after.status, outcome: after.outcome },
      context: d.feedback ? { feedback: d.feedback } : undefined,
    });
    return after;
  });
}

export async function updateInterviewFeedback(
  input: UpdateInterviewFeedbackInput,
): Promise<Interview> {
  const session = await requirePermission('recruitment', 'interviews', 'edit');
  const d = parse<ReturnType<typeof UpdateInterviewFeedbackSchema.parse>>(
    UpdateInterviewFeedbackSchema,
    input,
    'Invalid feedback',
  );
  return db.transaction(async (tx) => {
    const before = await lockInterview(tx, d.interviewId);
    if (before.status !== 'COMPLETED') {
      throw new BusinessRuleError(
        'INTERVIEW_NOT_COMPLETED',
        'Feedback and outcome can be updated once the interview is completed.',
      );
    }
    const [after] = await tx
      .update(interviews)
      .set({
        outcome: d.outcome,
        notes: appendFeedback(before.notes, d.feedback, session.user.name || session.user.email),
        updatedAt: sql`NOW()`,
      })
      .where(eq(interviews.id, before.id))
      .returning();
    if (!after) throw new Error('interview feedback returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'interview',
      entityId: after.id,
      action: 'FEEDBACK_RECORDED',
      before: { outcome: before.outcome },
      after: { outcome: after.outcome },
      context: d.feedback ? { feedback: d.feedback } : undefined,
    });
    return after;
  });
}
