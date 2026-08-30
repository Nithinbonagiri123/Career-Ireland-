import { and, asc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { tasks } from '@/lib/db/schema/activities';
import { immigrationCases } from '@/lib/db/schema/immigration';
import { interviews } from '@/lib/db/schema/interviews_offers';
import { persons } from '@/lib/db/schema/persons';
import { employers, jobApplications, jobRequisitions } from '@/lib/db/schema/recruitment';
import { users } from '@/lib/db/schema/users';

const DRILLDOWN_LIMIT = 6;

export type UnfilledRequisitionRow = {
  id: string;
  title: string;
  employerId: string;
  employerName: string;
  positionsFilled: number;
  positionsRequired: number;
  status: 'OPEN' | 'IN_PROGRESS' | 'PARTIALLY_FILLED';
  createdAt: Date;
  ageDays: number;
};

export type UpcomingInterviewRow = {
  id: string;
  applicationId: string;
  candidateName: string;
  candidatePersonId: string;
  jobLabel: string;
  scheduledAt: Date;
  mode: 'PHONE' | 'VIDEO' | 'IN_PERSON' | 'PANEL';
};

export type OverdueTaskRow = {
  id: string;
  title: string;
  dueAt: Date | null;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  assignedName: string;
  /** One of the linked subjects for a quick jump. */
  href: string;
};

export type ExpiringImmigrationCaseRow = {
  id: string;
  beneficiaryName: string;
  caseType: 'EMPLOYMENT_PERMIT' | 'VISA' | 'VISA_EXTENSION';
  expiresOn: string;
  daysUntilExpiry: number;
};

export type DashboardDrilldowns = {
  unfilledRequisitions: UnfilledRequisitionRow[];
  interviewsThisWeek: UpcomingInterviewRow[];
  overdueTasks: OverdueTaskRow[];
  expiringImmigrationCases: ExpiringImmigrationCaseRow[];
};

/**
 * Small, targeted row lists for the main dashboard's "act on this now" section.
 * Each list caps at ~6 rows and links out to the full list page for the rest.
 */
export async function fetchDashboardDrilldowns(): Promise<DashboardDrilldowns> {
  await requireRole(['ADMIN', 'STAFF']);

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const inSevenDays = new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000);
  const in60Days = new Date(startOfToday.getTime() + 60 * 24 * 60 * 60 * 1000);
  const in60DaysDateStr = in60Days.toISOString().slice(0, 10);

  // ─── Unfilled requisitions ────────────────────────────────────────────────
  const unfilledRows = await db
    .select({
      id: jobRequisitions.id,
      title: jobRequisitions.title,
      employerId: jobRequisitions.employerId,
      employerName: employers.legalName,
      positionsFilled: jobRequisitions.positionsFilled,
      positionsRequired: jobRequisitions.positionsRequired,
      status: jobRequisitions.status,
      createdAt: jobRequisitions.createdAt,
    })
    .from(jobRequisitions)
    .innerJoin(employers, eq(employers.id, jobRequisitions.employerId))
    .where(inArray(jobRequisitions.status, ['OPEN', 'IN_PROGRESS', 'PARTIALLY_FILLED']))
    .orderBy(asc(jobRequisitions.createdAt))
    .limit(DRILLDOWN_LIMIT);

  const unfilledRequisitions: UnfilledRequisitionRow[] = unfilledRows.map((r) => ({
    id: r.id,
    title: r.title,
    employerId: r.employerId,
    employerName: r.employerName,
    positionsFilled: r.positionsFilled,
    positionsRequired: r.positionsRequired,
    status: r.status as 'OPEN' | 'IN_PROGRESS' | 'PARTIALLY_FILLED',
    createdAt: r.createdAt,
    ageDays: Math.max(
      0,
      Math.floor((now.getTime() - r.createdAt.getTime()) / (24 * 60 * 60 * 1000)),
    ),
  }));

  // ─── Interviews this week (SCHEDULED, within 7 days) ──────────────────────
  const ivRows = await db
    .select({
      id: interviews.id,
      applicationId: interviews.jobApplicationId,
      scheduledAt: interviews.scheduledAt,
      mode: interviews.mode,
      candidateFirst: persons.firstName,
      candidateLast: persons.lastName,
      candidatePersonId: persons.id,
      requisitionTitle: jobRequisitions.title,
      applicationSource: jobApplications.source,
      externalJobTitle: jobApplications.externalJobTitle,
      externalCompany: jobApplications.externalCompanyName,
    })
    .from(interviews)
    .innerJoin(jobApplications, eq(jobApplications.id, interviews.jobApplicationId))
    .innerJoin(persons, eq(persons.id, jobApplications.personId))
    .leftJoin(jobRequisitions, eq(jobRequisitions.id, jobApplications.jobRequisitionId))
    .where(
      and(
        eq(interviews.status, 'SCHEDULED'),
        gte(interviews.scheduledAt, now),
        lte(interviews.scheduledAt, inSevenDays),
      ),
    )
    .orderBy(asc(interviews.scheduledAt))
    .limit(DRILLDOWN_LIMIT);

  const interviewsThisWeek: UpcomingInterviewRow[] = ivRows.map((r) => ({
    id: r.id,
    applicationId: r.applicationId,
    candidateName: `${r.candidateFirst} ${r.candidateLast}`,
    candidatePersonId: r.candidatePersonId,
    jobLabel:
      r.applicationSource !== 'INTERNAL'
        ? (r.externalJobTitle ?? r.externalCompany ?? 'External application')
        : (r.requisitionTitle ?? 'Requisition'),
    scheduledAt: r.scheduledAt,
    mode: r.mode,
  }));

  // ─── Overdue tasks ────────────────────────────────────────────────────────
  const taskRows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      dueAt: tasks.dueAt,
      priority: tasks.priority,
      assignedName: users.fullName,
      personId: tasks.personId,
      employerId: tasks.employerId,
      jobRequisitionId: tasks.jobRequisitionId,
      immigrationCaseId: tasks.immigrationCaseId,
    })
    .from(tasks)
    .innerJoin(users, eq(users.id, tasks.assignedUserId))
    .where(
      and(
        inArray(tasks.status, ['OPEN', 'IN_PROGRESS']),
        lte(tasks.dueAt, now),
        // Only include tasks with a due date — undated tasks aren't "overdue".
        sql`${tasks.dueAt} IS NOT NULL`,
      ),
    )
    .orderBy(asc(tasks.dueAt))
    .limit(DRILLDOWN_LIMIT);

  const overdueTasks: OverdueTaskRow[] = taskRows.map((r) => ({
    id: r.id,
    title: r.title,
    dueAt: r.dueAt,
    priority: r.priority,
    assignedName: r.assignedName,
    href: r.immigrationCaseId
      ? `/immigration/${r.immigrationCaseId}`
      : r.jobRequisitionId
        ? `/requisitions/${r.jobRequisitionId}`
        : r.personId
          ? `/candidates/${r.personId}`
          : r.employerId
            ? `/employers/${r.employerId}`
            : '/tasks',
  }));

  // ─── Expiring immigration cases (within 60 days, not archived, not closed) ─
  const caseRows = await db
    .select({
      id: immigrationCases.id,
      caseType: immigrationCases.caseType,
      expiresOn: immigrationCases.expiresOn,
      firstName: persons.firstName,
      lastName: persons.lastName,
    })
    .from(immigrationCases)
    .innerJoin(persons, eq(persons.id, immigrationCases.beneficiaryPersonId))
    .where(
      and(
        isNull(immigrationCases.archivedAt),
        sql`${immigrationCases.expiresOn} IS NOT NULL`,
        lte(immigrationCases.expiresOn, in60DaysDateStr),
      ),
    )
    .orderBy(asc(immigrationCases.expiresOn))
    .limit(DRILLDOWN_LIMIT);

  const expiringImmigrationCases: ExpiringImmigrationCaseRow[] = caseRows
    .filter((r): r is typeof r & { expiresOn: string } => Boolean(r.expiresOn))
    .map((r) => {
      const expiry = new Date(r.expiresOn);
      const days = Math.floor((expiry.getTime() - startOfToday.getTime()) / (24 * 60 * 60 * 1000));
      return {
        id: r.id,
        beneficiaryName: `${r.firstName} ${r.lastName}`,
        caseType: r.caseType,
        expiresOn: r.expiresOn,
        daysUntilExpiry: days,
      };
    });

  return { unfilledRequisitions, interviewsThisWeek, overdueTasks, expiringImmigrationCases };
}
