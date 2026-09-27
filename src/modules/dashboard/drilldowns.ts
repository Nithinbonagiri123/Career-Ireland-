import { and, asc, desc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
import { requireInternalStaff } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { tasks } from '@/lib/db/schema/activities';
import { immigrationCases } from '@/lib/db/schema/immigration';
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

/**
 * Represents a candidate currently at the Interview stage on a
 * requisition pipeline. The CRM doesn't schedule the interview itself
 * (the employer does) — this row is only "who's in the stage right now"
 * for the dashboard "act on this" strip.
 */
export type InterviewStageRow = {
  applicationId: string;
  candidateName: string;
  candidatePersonId: string;
  jobLabel: string;
  requisitionId: string | null;
  promotedAt: Date;
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
  interviewStageApplications: InterviewStageRow[];
  overdueTasks: OverdueTaskRow[];
  expiringImmigrationCases: ExpiringImmigrationCaseRow[];
};

/**
 * Small, targeted row lists for the main dashboard's "act on this now" section.
 * Each list caps at ~6 rows and links out to the full list page for the rest.
 */
export async function fetchDashboardDrilldowns(): Promise<DashboardDrilldowns> {
  await requireInternalStaff();

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
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

  // ─── Interview stage (candidates currently at status='INTERVIEW') ─────────
  // Preview of what /interviews shows — most-recently promoted first so the
  // strip reflects "who just moved into Interview" as a nudge to follow up.
  const ivRows = await db
    .select({
      applicationId: jobApplications.id,
      updatedAt: jobApplications.updatedAt,
      candidateFirst: persons.firstName,
      candidateLast: persons.lastName,
      candidatePersonId: persons.id,
      requisitionId: jobRequisitions.id,
      requisitionTitle: jobRequisitions.title,
      applicationSource: jobApplications.source,
      externalJobTitle: jobApplications.externalJobTitle,
      externalCompany: jobApplications.externalCompanyName,
    })
    .from(jobApplications)
    .innerJoin(persons, eq(persons.id, jobApplications.personId))
    .leftJoin(jobRequisitions, eq(jobRequisitions.id, jobApplications.jobRequisitionId))
    .where(and(eq(jobApplications.status, 'INTERVIEW'), isNull(persons.archivedAt)))
    .orderBy(desc(jobApplications.updatedAt))
    .limit(DRILLDOWN_LIMIT);

  const interviewStageApplications: InterviewStageRow[] = ivRows.map((r) => ({
    applicationId: r.applicationId,
    candidateName: `${r.candidateFirst} ${r.candidateLast}`,
    candidatePersonId: r.candidatePersonId,
    jobLabel:
      r.applicationSource !== 'INTERNAL'
        ? (r.externalJobTitle ?? r.externalCompany ?? 'External application')
        : (r.requisitionTitle ?? 'Requisition'),
    requisitionId: r.requisitionId,
    promotedAt: r.updatedAt,
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

  return {
    unfilledRequisitions,
    interviewStageApplications,
    overdueTasks,
    expiringImmigrationCases,
  };
}
