import { and, eq, gte, inArray, lte, ne } from 'drizzle-orm';
import type { DbExecutor } from '@/lib/audit/withAudit';
import { interviews } from '@/lib/db/schema/interviews_offers';
import { jobApplications } from '@/lib/db/schema/recruitment';
import { BusinessRuleError } from '@/lib/errors';

/**
 * Reject the second interview if the same candidate already has an active
 * (SCHEDULED or RESCHEDULED) interview whose window overlaps the proposed
 * time. Duration defaults to 60 minutes when unspecified so a bare
 * "10:00 for candidate X" schedule still conflicts with "10:30 for X".
 *
 * Kept in its own module (no NextAuth / no `requireRole`) so vitest can
 * unit-test the logic without a live session. Called by both scheduleInterview
 * and rescheduleInterview. `ignoreInterviewId` skips the row being rescheduled
 * so it doesn't conflict with itself.
 */
export async function assertNoTimeConflict(
  tx: DbExecutor,
  args: {
    jobApplicationId: string;
    scheduledAt: Date;
    durationMinutes: number | null;
    ignoreInterviewId?: string;
  },
): Promise<void> {
  const durationMs = (args.durationMinutes ?? 60) * 60_000;
  const proposedStart = args.scheduledAt;
  const proposedEnd = new Date(proposedStart.getTime() + durationMs);

  // Widen the search window by 6h on each side because we can't compute the
  // existing interview's end time in SQL without a computed column. We filter
  // for exact overlap in JS below.
  const sixHoursMs = 6 * 60 * 60 * 1000;
  const windowStart = new Date(proposedStart.getTime() - sixHoursMs);
  const windowEnd = new Date(proposedEnd.getTime() + sixHoursMs);

  const [app] = await tx
    .select({ personId: jobApplications.personId })
    .from(jobApplications)
    .where(eq(jobApplications.id, args.jobApplicationId))
    .limit(1);
  if (!app) return; // application not found — let the caller's insert FK fail with a clearer error

  const baseWhere = and(
    eq(jobApplications.personId, app.personId),
    inArray(interviews.status, ['SCHEDULED', 'RESCHEDULED']),
    gte(interviews.scheduledAt, windowStart),
    lte(interviews.scheduledAt, windowEnd),
  );
  const conflictWhere = args.ignoreInterviewId
    ? and(baseWhere, ne(interviews.id, args.ignoreInterviewId))
    : baseWhere;

  const nearby = await tx
    .select({
      id: interviews.id,
      scheduledAt: interviews.scheduledAt,
      durationMinutes: interviews.durationMinutes,
    })
    .from(interviews)
    .innerJoin(jobApplications, eq(jobApplications.id, interviews.jobApplicationId))
    .where(conflictWhere);

  for (const existing of nearby) {
    const existingStart = existing.scheduledAt;
    const existingEnd = new Date(
      existingStart.getTime() + (existing.durationMinutes ?? 60) * 60_000,
    );
    // Overlap iff existingStart < proposedEnd AND existingEnd > proposedStart.
    // Strict less-than at both ends means a slot that starts exactly when
    // another ends is allowed (11:00 after a 10:00-11:00 interview is fine).
    if (existingStart < proposedEnd && existingEnd > proposedStart) {
      throw new BusinessRuleError(
        'INTERVIEW_TIME_CONFLICT',
        `Candidate already has an interview at ${existingStart.toISOString()} — pick a different slot`,
      );
    }
  }
}
