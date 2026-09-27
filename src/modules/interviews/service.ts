import { and, asc, eq, isNull } from 'drizzle-orm';
import { requireInternalStaff } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { persons } from '@/lib/db/schema/persons';
import { employers, jobApplications, jobRequisitions } from '@/lib/db/schema/recruitment';
import type { AssignmentScope } from '@/lib/scope';

/**
 * Global "who's on the Interview stage right now" list.
 *
 * The CRM does NOT schedule interviews itself — the employer runs the
 * interview and the recruiter is just tracking whether the candidate has
 * reached that stage. So this list is driven entirely off
 * `job_applications.status='INTERVIEW'` — the same source of truth the
 * requisition pipeline reads. If a candidate is in the Interview lane on
 * any requisition, they show up here. When they advance (or get
 * rejected/withdraw), they disappear.
 */
export type InterviewRow = {
  applicationId: string;
  candidatePersonId: string;
  candidateName: string;
  candidateEmail: string | null;
  requisitionId: string | null;
  requisitionTitle: string | null;
  employerName: string | null;
  isExternal: boolean;
  externalCompanyName: string | null;
  externalJobTitle: string | null;
  promotedAt: Date;
};

export async function listInterviewStageApplications(opts?: {
  scope?: AssignmentScope;
}): Promise<InterviewRow[]> {
  const session = await requireInternalStaff();
  const scope = opts?.scope ?? 'all';

  let scopePredicate: ReturnType<typeof and> | undefined;
  if (scope === 'mine') {
    scopePredicate = eq(jobRequisitions.assignedUserId, session.user.id);
  } else if (scope === 'unassigned') {
    scopePredicate = isNull(jobRequisitions.assignedUserId);
  }

  const rows = await db
    .select({
      applicationId: jobApplications.id,
      candidatePersonId: persons.id,
      candidateFirst: persons.firstName,
      candidateLast: persons.lastName,
      candidateEmail: persons.email,
      updatedAt: jobApplications.updatedAt,
      requisitionId: jobRequisitions.id,
      requisitionTitle: jobRequisitions.title,
      employerName: employers.legalName,
      source: jobApplications.source,
      externalCompanyName: jobApplications.externalCompanyName,
      externalJobTitle: jobApplications.externalJobTitle,
    })
    .from(jobApplications)
    .innerJoin(persons, eq(persons.id, jobApplications.personId))
    .leftJoin(jobRequisitions, eq(jobRequisitions.id, jobApplications.jobRequisitionId))
    .leftJoin(employers, eq(employers.id, jobRequisitions.employerId))
    .where(and(eq(jobApplications.status, 'INTERVIEW'), isNull(persons.archivedAt), scopePredicate))
    .orderBy(asc(jobApplications.updatedAt));

  return rows.map((r) => {
    const isExternal = r.source !== 'INTERNAL';
    return {
      applicationId: r.applicationId,
      candidatePersonId: r.candidatePersonId,
      candidateName: `${r.candidateFirst} ${r.candidateLast}`,
      candidateEmail: r.candidateEmail,
      requisitionId: r.requisitionId,
      requisitionTitle: r.requisitionTitle,
      employerName: r.employerName,
      isExternal,
      externalCompanyName: r.externalCompanyName,
      externalJobTitle: r.externalJobTitle,
      promotedAt: r.updatedAt,
    };
  });
}
