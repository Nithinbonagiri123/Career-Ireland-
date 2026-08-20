import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { payments, serviceEngagements } from '@/lib/db/schema/commerce';
import { candidateProfiles, persons } from '@/lib/db/schema/persons';
import {
  employers,
  jobApplications,
  jobRequisitions,
  placements,
} from '@/lib/db/schema/recruitment';
import { serviceCatalogItems } from '@/lib/db/schema/services';

/** All queries here are ALREADY scoped to a specific person — never call without a personId. */

export async function fetchCandidateSelf(personId: string) {
  const [row] = await db.select().from(persons).where(eq(persons.id, personId)).limit(1);
  if (!row) return null;
  const [profile] = await db
    .select()
    .from(candidateProfiles)
    .where(eq(candidateProfiles.personId, personId))
    .limit(1);
  return { person: row, profile: profile ?? null };
}

export async function fetchOwnApplications(personId: string) {
  const rows = await db
    .select({
      id: jobApplications.id,
      status: jobApplications.status,
      appliedAt: jobApplications.appliedAt,
      title: jobRequisitions.title,
      employerName: employers.legalName,
      location: jobRequisitions.location,
      employmentType: jobRequisitions.employmentType,
    })
    .from(jobApplications)
    .innerJoin(jobRequisitions, eq(jobRequisitions.id, jobApplications.jobRequisitionId))
    .innerJoin(employers, eq(employers.id, jobRequisitions.employerId))
    .where(eq(jobApplications.personId, personId))
    .orderBy(desc(jobApplications.appliedAt));
  return rows;
}

export async function fetchOwnPlacements(personId: string) {
  const rows = await db
    .select({
      id: placements.id,
      status: placements.status,
      offerDate: placements.offerDate,
      startDate: placements.startDate,
      endDate: placements.endDate,
      salary: placements.salary,
      salaryCurrencyCode: placements.salaryCurrencyCode,
      createdAt: placements.createdAt,
      title: jobRequisitions.title,
      employerName: employers.legalName,
    })
    .from(placements)
    .innerJoin(jobRequisitions, eq(jobRequisitions.id, placements.jobRequisitionId))
    .innerJoin(employers, eq(employers.id, placements.employerId))
    .where(eq(placements.personId, personId))
    .orderBy(desc(placements.createdAt));
  return rows;
}

export async function fetchOwnPayments(personId: string) {
  const rows = await db
    .select({
      id: payments.id,
      amount: payments.amount,
      currency: payments.currencyCode,
      method: payments.method,
      status: payments.status,
      createdAt: payments.createdAt,
      verifiedAt: payments.verifiedAt,
      serviceName: serviceCatalogItems.name,
    })
    .from(payments)
    .innerJoin(serviceEngagements, eq(serviceEngagements.id, payments.serviceEngagementId))
    .innerJoin(
      serviceCatalogItems,
      eq(serviceCatalogItems.id, serviceEngagements.serviceCatalogItemId),
    )
    .where(eq(serviceEngagements.payerPersonId, personId))
    .orderBy(desc(payments.createdAt));
  return rows;
}
