import { and, count, eq, inArray, isNull, lte, ne } from 'drizzle-orm';
import { requireInternalStaff } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { tasks } from '@/lib/db/schema/activities';
import { immigrationCases } from '@/lib/db/schema/immigration';
import { leads } from '@/lib/db/schema/leads';
import { candidateProfiles } from '@/lib/db/schema/persons';
import { employers, jobRequisitions } from '@/lib/db/schema/recruitment';

/**
 * Phase 1 blueprint §12.1 — a dashboard shaped around what the user
 * personally needs to do, not just business-wide stats. This read
 * helper returns a count-only roll-up per assignable record type for
 * the current signed-in user.
 *
 * Lightweight on purpose — each sub-query is a single COUNT; the
 * dashboard uses the numbers to drive four cards and deep-links each
 * card to the matching list page with `?assigned=me` already applied.
 */

export type MyWorkCounts = {
  userId: string;
  openCandidates: number;
  openLeads: number;
  openRequisitions: number;
  openEmployers: number;
  openImmigrationCases: number;
  overdueTasks: number;
  openTasks: number;
};

export async function fetchMyWorkCounts(): Promise<MyWorkCounts> {
  const session = await requireInternalStaff();
  const userId = session.user.id;
  const now = new Date();

  const [cand, ld, req, emp, imm, overdue, openTasksCount] = await Promise.all([
    db
      .select({ v: count() })
      .from(candidateProfiles)
      .where(
        and(
          eq(candidateProfiles.assignedUserId, userId),
          ne(candidateProfiles.lifecycleStatus, 'ARCHIVED'),
        ),
      ),
    db
      .select({ v: count() })
      .from(leads)
      .where(
        and(
          eq(leads.assignedUserId, userId),
          inArray(leads.status, ['NEW', 'CONTACTED', 'AWAITING_PAYMENT']),
          isNull(leads.archivedAt),
        ),
      ),
    db
      .select({ v: count() })
      .from(jobRequisitions)
      .where(
        and(
          eq(jobRequisitions.assignedUserId, userId),
          inArray(jobRequisitions.status, ['DRAFT', 'OPEN', 'IN_PROGRESS', 'PARTIALLY_FILLED']),
          isNull(jobRequisitions.archivedAt),
        ),
      ),
    db
      .select({ v: count() })
      .from(employers)
      .where(
        and(
          eq(employers.assignedUserId, userId),
          ne(employers.relationshipStatus, 'ARCHIVED'),
          isNull(employers.archivedAt),
        ),
      ),
    db
      .select({ v: count() })
      .from(immigrationCases)
      .where(
        and(
          eq(immigrationCases.assignedUserId, userId),
          ne(immigrationCases.status, 'CLOSED'),
          isNull(immigrationCases.archivedAt),
        ),
      ),
    db
      .select({ v: count() })
      .from(tasks)
      .where(
        and(
          eq(tasks.assignedUserId, userId),
          inArray(tasks.status, ['OPEN', 'IN_PROGRESS']),
          lte(tasks.dueAt, now),
          isNull(tasks.archivedAt),
        ),
      ),
    db
      .select({ v: count() })
      .from(tasks)
      .where(
        and(
          eq(tasks.assignedUserId, userId),
          inArray(tasks.status, ['OPEN', 'IN_PROGRESS']),
          isNull(tasks.archivedAt),
        ),
      ),
  ]);

  return {
    userId,
    openCandidates: Number(cand[0]?.v ?? 0),
    openLeads: Number(ld[0]?.v ?? 0),
    openRequisitions: Number(req[0]?.v ?? 0),
    openEmployers: Number(emp[0]?.v ?? 0),
    openImmigrationCases: Number(imm[0]?.v ?? 0),
    overdueTasks: Number(overdue[0]?.v ?? 0),
    openTasks: Number(openTasksCount[0]?.v ?? 0),
  };
}
