import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import { requireInternalStaff } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { auditEvents } from '@/lib/db/schema/audit_events';
import { payments, serviceEngagements } from '@/lib/db/schema/commerce';
import { persons } from '@/lib/db/schema/persons';
import {
  candidateMatches,
  employers,
  jobApplications,
  jobRequisitions,
  placements,
} from '@/lib/db/schema/recruitment';
import { serviceCatalogItems } from '@/lib/db/schema/services';
import { users } from '@/lib/db/schema/users';

export type PlacementRow = {
  placementId: string;
  personName: string;
  employerName: string;
  requisitionTitle: string;
  status: string;
  offerDate: string | null;
  startDate: string | null;
  endDate: string | null;
  salary: string | null;
  currency: string | null;
  createdAt: Date;
};

export async function placementsInPeriod(days: number): Promise<PlacementRow[]> {
  await requireInternalStaff();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      placementId: placements.id,
      first: persons.firstName,
      last: persons.lastName,
      employer: employers.legalName,
      title: jobRequisitions.title,
      status: placements.status,
      offerDate: placements.offerDate,
      startDate: placements.startDate,
      endDate: placements.endDate,
      salary: placements.salary,
      currency: placements.salaryCurrencyCode,
      createdAt: placements.createdAt,
    })
    .from(placements)
    .innerJoin(persons, eq(persons.id, placements.personId))
    .innerJoin(employers, eq(employers.id, placements.employerId))
    .innerJoin(jobRequisitions, eq(jobRequisitions.id, placements.jobRequisitionId))
    .where(gt(placements.createdAt, since))
    .orderBy(desc(placements.createdAt));
  return rows.map((r) => ({
    placementId: r.placementId,
    personName: `${r.first} ${r.last}`,
    employerName: r.employer,
    requisitionTitle: r.title,
    status: r.status,
    offerDate: r.offerDate,
    startDate: r.startDate,
    endDate: r.endDate,
    salary: r.salary,
    currency: r.currency,
    createdAt: r.createdAt,
  }));
}

export type RevenueRow = {
  currency: string;
  serviceCode: string;
  serviceName: string;
  paymentCount: number;
  totalAmount: string;
};

export async function revenueByCurrencyAndService(days: number): Promise<RevenueRow[]> {
  await requireInternalStaff();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      currency: payments.currencyCode,
      serviceCode: serviceCatalogItems.code,
      serviceName: serviceCatalogItems.name,
      paymentCount: sql<number>`COUNT(${payments.id})::int`,
      totalAmount: sql<string>`SUM(${payments.amount})::text`,
    })
    .from(payments)
    .innerJoin(serviceEngagements, eq(serviceEngagements.id, payments.serviceEngagementId))
    .innerJoin(
      serviceCatalogItems,
      eq(serviceCatalogItems.id, serviceEngagements.serviceCatalogItemId),
    )
    .where(and(eq(payments.status, 'VERIFIED'), gt(payments.verifiedAt, since)))
    .groupBy(payments.currencyCode, serviceCatalogItems.code, serviceCatalogItems.name)
    .orderBy(payments.currencyCode, serviceCatalogItems.name);
  return rows.map((r) => ({
    currency: r.currency,
    serviceCode: r.serviceCode,
    serviceName: r.serviceName,
    paymentCount: r.paymentCount,
    totalAmount: r.totalAmount ?? '0',
  }));
}

// ─── Recruiter activity ───────────────────────────────────────────────────────

export type RecruiterActivityRow = {
  userId: string;
  fullName: string;
  role: string;
  candidatesAssigned: number;
  applicationsCreated: number;
  interviewsScheduled: number;
  placementsConfirmed: number;
  totalActions: number;
};

/**
 * Per-staff activity summary over the window. Sourced from audit_events so we
 * capture what people actually *did*, not just what they own now.
 * "Actions" = create + status-change events on candidate profiles, applications,
 * interviews, and placements. Zero-activity users are excluded.
 */
export async function recruiterActivity(days: number): Promise<RecruiterActivityRow[]> {
  await requireInternalStaff();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      userId: users.id,
      fullName: users.fullName,
      role: users.role,
      candidatesAssigned: sql<number>`
        COUNT(*) FILTER (
          WHERE ${auditEvents.entityType} = 'candidate_profile'
            AND ${auditEvents.action} IN ('ASSIGNED', 'CREATED')
        )::int
      `,
      applicationsCreated: sql<number>`
        COUNT(*) FILTER (
          WHERE ${auditEvents.entityType} = 'job_application'
            AND ${auditEvents.action} = 'CREATED'
        )::int
      `,
      interviewsScheduled: sql<number>`
        COUNT(*) FILTER (
          WHERE ${auditEvents.entityType} = 'interview'
            AND ${auditEvents.action} = 'CREATED'
        )::int
      `,
      placementsConfirmed: sql<number>`
        COUNT(*) FILTER (
          WHERE ${auditEvents.entityType} = 'placement'
            AND ${auditEvents.action} = 'STATUS_CHANGED'
            AND ${auditEvents.after}->>'status' = 'CONFIRMED'
        )::int
      `,
      totalActions: sql<number>`COUNT(*)::int`,
    })
    .from(auditEvents)
    .innerJoin(users, eq(users.id, auditEvents.actorUserId))
    .where(
      and(
        gt(auditEvents.occurredAt, since),
        inArray(users.role, ['ADMIN', 'STAFF']),
        inArray(auditEvents.entityType, [
          'candidate_profile',
          'job_application',
          'interview',
          'placement',
        ]),
      ),
    )
    .groupBy(users.id, users.fullName, users.role)
    .orderBy(desc(sql`COUNT(*)`));

  return rows.map((r) => ({
    userId: r.userId,
    fullName: r.fullName,
    role: r.role,
    candidatesAssigned: r.candidatesAssigned,
    applicationsCreated: r.applicationsCreated,
    interviewsScheduled: r.interviewsScheduled,
    placementsConfirmed: r.placementsConfirmed,
    totalActions: r.totalActions,
  }));
}

// ─── Requisition performance ─────────────────────────────────────────────────

export type RequisitionPerformanceRow = {
  requisitionId: string;
  title: string;
  employerName: string;
  status: string;
  positionsRequired: number;
  positionsFilled: number;
  fillRatePct: number;
  applications: number;
  matches: number;
  ageDays: number;
  createdAt: Date;
};

/**
 * Per-requisition throughput: how many applications came in, matches generated,
 * fill rate, and age. Includes only requisitions created in the window.
 */
export async function requisitionPerformance(days: number): Promise<RequisitionPerformanceRow[]> {
  await requireInternalStaff();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const now = Date.now();

  const rows = await db
    .select({
      requisitionId: jobRequisitions.id,
      title: jobRequisitions.title,
      employerName: employers.legalName,
      status: jobRequisitions.status,
      positionsRequired: jobRequisitions.positionsRequired,
      positionsFilled: jobRequisitions.positionsFilled,
      applications: sql<number>`(
        SELECT COUNT(*)::int FROM ${jobApplications}
        WHERE ${jobApplications.jobRequisitionId} = ${jobRequisitions.id}
      )`,
      matches: sql<number>`(
        SELECT COUNT(*)::int FROM ${candidateMatches}
        WHERE ${candidateMatches.jobRequisitionId} = ${jobRequisitions.id}
      )`,
      createdAt: jobRequisitions.createdAt,
    })
    .from(jobRequisitions)
    .innerJoin(employers, eq(employers.id, jobRequisitions.employerId))
    .where(gt(jobRequisitions.createdAt, since))
    .orderBy(desc(jobRequisitions.createdAt));

  return rows.map((r) => ({
    requisitionId: r.requisitionId,
    title: r.title,
    employerName: r.employerName,
    status: r.status,
    positionsRequired: r.positionsRequired,
    positionsFilled: r.positionsFilled,
    fillRatePct:
      r.positionsRequired > 0 ? Math.round((r.positionsFilled / r.positionsRequired) * 100) : 0,
    applications: r.applications,
    matches: r.matches,
    ageDays: Math.max(0, Math.floor((now - r.createdAt.getTime()) / (24 * 60 * 60 * 1000))),
    createdAt: r.createdAt,
  }));
}

// ─── Application funnel ──────────────────────────────────────────────────────

export type ApplicationFunnelRow = {
  stage: string;
  count: number;
  pctOfApplied: number;
};

const APPLICATION_STAGES = [
  'APPLIED',
  'UNDER_REVIEW',
  'SHORTLISTED',
  'INTERVIEW',
  'OFFER',
  'ACCEPTED',
  'REJECTED',
  'WITHDRAWN',
];

/**
 * Applications by current status, over the window. Percentage is computed
 * relative to the total APPLIED count (drop-off rate at each stage).
 */
export async function applicationFunnel(days: number): Promise<ApplicationFunnelRow[]> {
  await requireInternalStaff();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      status: jobApplications.status,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(jobApplications)
    .where(gt(jobApplications.appliedAt, since))
    .groupBy(jobApplications.status);

  const byStatus = new Map<string, number>(rows.map((r) => [r.status as string, r.count]));
  const total = rows.reduce((sum, r) => sum + r.count, 0);

  return APPLICATION_STAGES.map((stage) => {
    const count = byStatus.get(stage) ?? 0;
    return {
      stage,
      count,
      pctOfApplied: total > 0 ? Math.round((count / total) * 100) : 0,
    };
  });
}

export type CandidatePipelineRow = {
  status: string;
  count: number;
};

export async function candidatePipeline(): Promise<CandidatePipelineRow[]> {
  await requireInternalStaff();
  const rows = await db
    .select({
      status: sql<string>`${placements.status}::text`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(placements)
    .groupBy(placements.status);
  return rows.map((r) => ({ status: r.status, count: r.count }));
}
