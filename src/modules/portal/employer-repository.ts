import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { persons } from '@/lib/db/schema/persons';
import {
  employers,
  jobApplications,
  jobRequisitions,
  placements,
  shortlistEntries,
} from '@/lib/db/schema/recruitment';

/** All employer-portal queries are ALREADY scoped to a specific employer — never call without an employerId. */

export async function fetchEmployerSelf(employerId: string) {
  const [row] = await db.select().from(employers).where(eq(employers.id, employerId)).limit(1);
  return row ?? null;
}

export async function fetchOwnRequisitions(employerId: string) {
  return db
    .select()
    .from(jobRequisitions)
    .where(eq(jobRequisitions.employerId, employerId))
    .orderBy(desc(jobRequisitions.createdAt));
}

export async function fetchOwnPlacements(employerId: string) {
  const rows = await db
    .select({
      id: placements.id,
      status: placements.status,
      startDate: placements.startDate,
      endDate: placements.endDate,
      salary: placements.salary,
      salaryCurrencyCode: placements.salaryCurrencyCode,
      createdAt: placements.createdAt,
      candidateName: persons.firstName,
      candidateLast: persons.lastName,
      requisitionTitle: jobRequisitions.title,
    })
    .from(placements)
    .innerJoin(persons, eq(persons.id, placements.personId))
    .innerJoin(jobRequisitions, eq(jobRequisitions.id, placements.jobRequisitionId))
    .where(eq(placements.employerId, employerId))
    .orderBy(desc(placements.createdAt));
  return rows.map((r) => ({
    ...r,
    candidateName: `${r.candidateName} ${r.candidateLast}`,
  }));
}

/** Shortlist visible to the employer for a specific requisition they own. */
export async function fetchShortlistForOwnRequisition(employerId: string, requisitionId: string) {
  const [req] = await db
    .select()
    .from(jobRequisitions)
    .where(and(eq(jobRequisitions.id, requisitionId), eq(jobRequisitions.employerId, employerId)))
    .limit(1);
  if (!req) return null;

  const shortlistRows = await db
    .select({
      shortlistId: shortlistEntries.id,
      presentedAt: shortlistEntries.presentedToEmployerAt,
      employerFeedback: shortlistEntries.employerFeedback,
      candidateFirst: persons.firstName,
      candidateLast: persons.lastName,
      candidateEmail: persons.email,
      currentCity: persons.currentCity,
    })
    .from(shortlistEntries)
    .innerJoin(persons, eq(persons.id, shortlistEntries.personId))
    .where(eq(shortlistEntries.jobRequisitionId, requisitionId));

  const appRows = await db
    .select({
      id: jobApplications.id,
      status: jobApplications.status,
      appliedAt: jobApplications.appliedAt,
      personFirst: persons.firstName,
      personLast: persons.lastName,
    })
    .from(jobApplications)
    .innerJoin(persons, eq(persons.id, jobApplications.personId))
    .where(eq(jobApplications.jobRequisitionId, requisitionId))
    .orderBy(desc(jobApplications.appliedAt));

  return {
    requisition: req,
    shortlist: shortlistRows.map((s) => ({
      shortlistId: s.shortlistId,
      candidateName: `${s.candidateFirst} ${s.candidateLast}`,
      candidateEmail: s.candidateEmail,
      candidateCity: s.currentCity,
      presentedAt: s.presentedAt,
      employerFeedback: s.employerFeedback,
    })),
    applications: appRows.map((a) => ({
      id: a.id,
      status: a.status,
      appliedAt: a.appliedAt,
      candidateName: `${a.personFirst} ${a.personLast}`,
    })),
  };
}
