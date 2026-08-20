import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { payments, serviceEngagements } from '@/lib/db/schema/commerce';
import { persons } from '@/lib/db/schema/persons';
import { employers, jobRequisitions, placements } from '@/lib/db/schema/recruitment';
import { serviceCatalogItems } from '@/lib/db/schema/services';

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
  await requireRole(['ADMIN', 'STAFF']);
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
  await requireRole(['ADMIN', 'STAFF']);
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

export type CandidatePipelineRow = {
  status: string;
  count: number;
};

export async function candidatePipeline(): Promise<CandidatePipelineRow[]> {
  await requireRole(['ADMIN', 'STAFF']);
  const rows = await db
    .select({
      status: sql<string>`${placements.status}::text`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(placements)
    .groupBy(placements.status);
  return rows.map((r) => ({ status: r.status, count: r.count }));
}
