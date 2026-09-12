import { eq, or } from 'drizzle-orm';
import { requireInternalStaff } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { communicationLogs, tasks } from '@/lib/db/schema/activities';
import { payments, serviceEngagements } from '@/lib/db/schema/commerce';
import { immigrationCases } from '@/lib/db/schema/immigration';
import { leads } from '@/lib/db/schema/leads';
import { occupations } from '@/lib/db/schema/occupations';
import type { CandidateProfile, Person } from '@/lib/db/schema/persons';
import { candidateProfiles, persons } from '@/lib/db/schema/persons';
import {
  employers,
  jobApplications,
  jobRequisitions,
  placements,
} from '@/lib/db/schema/recruitment';
import { serviceCatalogItems } from '@/lib/db/schema/services';

export type PersonTimelineItem =
  | {
      kind: 'communication';
      id: string;
      at: Date;
      title: string;
      subtitle: string;
    }
  | { kind: 'task'; id: string; at: Date; title: string; subtitle: string; status: string }
  | { kind: 'lead'; id: string; at: Date; title: string; subtitle: string }
  | { kind: 'application'; id: string; at: Date; title: string; subtitle: string }
  | { kind: 'placement'; id: string; at: Date; title: string; subtitle: string }
  | { kind: 'engagement'; id: string; at: Date; title: string; subtitle: string }
  | { kind: 'payment'; id: string; at: Date; title: string; subtitle: string }
  | { kind: 'immigration'; id: string; at: Date; title: string; subtitle: string };

/** Candidate profile plus denormalised joins that the detail view needs. */
export type CandidateProfileWithJoins = CandidateProfile & {
  primaryOccupationName: string | null;
};

export type PersonDetail = {
  person: Person;
  candidateProfile: CandidateProfileWithJoins | null;
  timeline: PersonTimelineItem[];
};

export async function fetchPersonDetail(id: string): Promise<PersonDetail | null> {
  await requireInternalStaff();

  const [person] = await db.select().from(persons).where(eq(persons.id, id)).limit(1);
  if (!person) return null;

  const [profileRow] = await db
    .select({ profile: candidateProfiles, occupationName: occupations.name })
    .from(candidateProfiles)
    .leftJoin(occupations, eq(occupations.id, candidateProfiles.primaryOccupationId))
    .where(eq(candidateProfiles.personId, id))
    .limit(1);
  const profile: CandidateProfileWithJoins | undefined = profileRow
    ? { ...profileRow.profile, primaryOccupationName: profileRow.occupationName }
    : undefined;

  const [
    leadRows,
    applicationRows,
    placementRows,
    engagementRows,
    immigrationRows,
    commRows,
    taskRows,
  ] = await Promise.all([
    db.select().from(leads).where(eq(leads.personId, id)),
    db
      .select({
        id: jobApplications.id,
        status: jobApplications.status,
        appliedAt: jobApplications.appliedAt,
        title: jobRequisitions.title,
        employerName: employers.legalName,
      })
      .from(jobApplications)
      .innerJoin(jobRequisitions, eq(jobRequisitions.id, jobApplications.jobRequisitionId))
      .innerJoin(employers, eq(employers.id, jobRequisitions.employerId))
      .where(eq(jobApplications.personId, id)),
    db
      .select({
        id: placements.id,
        status: placements.status,
        createdAt: placements.createdAt,
        title: jobRequisitions.title,
        employerName: employers.legalName,
      })
      .from(placements)
      .innerJoin(jobRequisitions, eq(jobRequisitions.id, placements.jobRequisitionId))
      .innerJoin(employers, eq(employers.id, placements.employerId))
      .where(eq(placements.personId, id)),
    db
      .select({
        id: serviceEngagements.id,
        status: serviceEngagements.status,
        createdAt: serviceEngagements.createdAt,
        amount: serviceEngagements.agreedAmount,
        currency: serviceEngagements.currencyCode,
        serviceName: serviceCatalogItems.name,
      })
      .from(serviceEngagements)
      .innerJoin(
        serviceCatalogItems,
        eq(serviceCatalogItems.id, serviceEngagements.serviceCatalogItemId),
      )
      .where(
        or(
          eq(serviceEngagements.payerPersonId, id),
          eq(serviceEngagements.beneficiaryPersonId, id),
        ),
      ),
    db.select().from(immigrationCases).where(eq(immigrationCases.beneficiaryPersonId, id)),
    db.select().from(communicationLogs).where(eq(communicationLogs.personId, id)),
    db.select().from(tasks).where(eq(tasks.personId, id)),
  ]);

  const paymentRows =
    engagementRows.length > 0
      ? await db
          .select({
            id: payments.id,
            amount: payments.amount,
            currency: payments.currencyCode,
            status: payments.status,
            method: payments.method,
            createdAt: payments.createdAt,
            serviceEngagementId: payments.serviceEngagementId,
          })
          .from(payments)
          .where(
            or(...engagementRows.map((e) => eq(payments.serviceEngagementId, e.id))) ?? undefined,
          )
      : [];

  const timeline: PersonTimelineItem[] = [
    ...leadRows.map(
      (l): PersonTimelineItem => ({
        kind: 'lead',
        id: l.id,
        at: l.createdAt,
        title: `Lead created`,
        subtitle: `Status ${l.status.replace(/_/g, ' ')}`,
      }),
    ),
    ...applicationRows.map(
      (a): PersonTimelineItem => ({
        kind: 'application',
        id: a.id,
        at: a.appliedAt,
        title: `Applied — ${a.title}`,
        subtitle: `${a.employerName} · ${a.status.replace(/_/g, ' ')}`,
      }),
    ),
    ...placementRows.map(
      (p): PersonTimelineItem => ({
        kind: 'placement',
        id: p.id,
        at: p.createdAt,
        title: `Placement — ${p.title}`,
        subtitle: `${p.employerName} · ${p.status.replace(/_/g, ' ')}`,
      }),
    ),
    ...engagementRows.map(
      (e): PersonTimelineItem => ({
        kind: 'engagement',
        id: e.id,
        at: e.createdAt,
        title: `Engagement — ${e.serviceName}`,
        subtitle: `${e.amount} ${e.currency} · ${e.status.replace(/_/g, ' ')}`,
      }),
    ),
    ...paymentRows.map(
      (p): PersonTimelineItem => ({
        kind: 'payment',
        id: p.id,
        at: p.createdAt,
        title: `Payment — ${p.amount} ${p.currency}`,
        subtitle: `${p.method.replace(/_/g, ' ')} · ${p.status.replace(/_/g, ' ')}`,
      }),
    ),
    ...immigrationRows.map(
      (c): PersonTimelineItem => ({
        kind: 'immigration',
        id: c.id,
        at: c.createdAt,
        title: `${c.caseType.replace(/_/g, ' ')} case`,
        subtitle: c.status.replace(/_/g, ' '),
      }),
    ),
    ...commRows.map(
      (c): PersonTimelineItem => ({
        kind: 'communication',
        id: c.id,
        at: c.occurredAt,
        title: `${c.type.replace(/_/g, ' ')} — ${c.subject ?? '(no subject)'}`,
        subtitle: c.direction,
      }),
    ),
    ...taskRows.map(
      (t): PersonTimelineItem => ({
        kind: 'task',
        id: t.id,
        at: t.createdAt,
        title: `Task — ${t.title}`,
        subtitle: t.status.replace(/_/g, ' '),
        status: t.status,
      }),
    ),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return { person, candidateProfile: profile ?? null, timeline };
}
