import { desc, eq, isNull } from 'drizzle-orm';
import type { DbExecutor } from '@/lib/audit/withAudit';
import { db } from '@/lib/db/client';
import {
  type NewPayment,
  type NewServiceEngagement,
  type Payment,
  payments,
  type ServiceEngagement,
  serviceEngagements,
} from '@/lib/db/schema/commerce';
import { persons } from '@/lib/db/schema/persons';
import { serviceCatalogItems } from '@/lib/db/schema/services';

export type EngagementListRow = ServiceEngagement & {
  serviceName: string;
  payerLabel: string;
  beneficiaryName: string | null;
};

export async function listEngagements(): Promise<EngagementListRow[]> {
  const rows = await db
    .select({
      engagement: serviceEngagements,
      serviceName: serviceCatalogItems.name,
      payerFirst: persons.firstName,
      payerLast: persons.lastName,
    })
    .from(serviceEngagements)
    .innerJoin(
      serviceCatalogItems,
      eq(serviceCatalogItems.id, serviceEngagements.serviceCatalogItemId),
    )
    .leftJoin(persons, eq(persons.id, serviceEngagements.payerPersonId))
    .where(isNull(serviceEngagements.archivedAt))
    .orderBy(desc(serviceEngagements.createdAt));

  // Beneficiary lookup in a separate query — small volumes, avoids self-join tangles.
  const beneficiaryIds = Array.from(
    new Set(
      rows.map((r) => r.engagement.beneficiaryPersonId).filter((id): id is string => Boolean(id)),
    ),
  );
  const beneficiaryMap = new Map<string, string>();
  if (beneficiaryIds.length > 0) {
    const bRows = await db
      .select({ id: persons.id, firstName: persons.firstName, lastName: persons.lastName })
      .from(persons);
    for (const b of bRows) {
      beneficiaryMap.set(b.id, `${b.firstName} ${b.lastName}`);
    }
  }

  return rows.map((r) => ({
    ...r.engagement,
    serviceName: r.serviceName,
    payerLabel: r.payerFirst
      ? `${r.payerFirst} ${r.payerLast}`
      : r.engagement.payerEmployerId
        ? 'Employer'
        : 'Unknown',
    beneficiaryName: r.engagement.beneficiaryPersonId
      ? (beneficiaryMap.get(r.engagement.beneficiaryPersonId) ?? null)
      : null,
  }));
}

export async function getEngagement(id: string): Promise<ServiceEngagement | null> {
  const [row] = await db
    .select()
    .from(serviceEngagements)
    .where(eq(serviceEngagements.id, id))
    .limit(1);
  return row ?? null;
}

export async function insertEngagement(
  tx: DbExecutor,
  data: NewServiceEngagement,
): Promise<ServiceEngagement> {
  const [row] = await tx.insert(serviceEngagements).values(data).returning();
  if (!row) throw new Error('service_engagements insert returned no row');
  return row;
}

export async function updateEngagement(
  tx: DbExecutor,
  id: string,
  patch: Partial<Pick<ServiceEngagement, 'status' | 'notes'>>,
): Promise<ServiceEngagement> {
  const [row] = await tx
    .update(serviceEngagements)
    .set(patch)
    .where(eq(serviceEngagements.id, id))
    .returning();
  if (!row) throw new Error(`engagement ${id} not found`);
  return row;
}

export async function listPayments(): Promise<Array<Payment & { serviceName: string }>> {
  const rows = await db
    .select({
      payment: payments,
      serviceName: serviceCatalogItems.name,
    })
    .from(payments)
    .innerJoin(serviceEngagements, eq(serviceEngagements.id, payments.serviceEngagementId))
    .innerJoin(
      serviceCatalogItems,
      eq(serviceCatalogItems.id, serviceEngagements.serviceCatalogItemId),
    )
    .where(isNull(serviceEngagements.archivedAt))
    .orderBy(desc(payments.createdAt));
  return rows.map((r) => ({ ...r.payment, serviceName: r.serviceName }));
}

export async function getPayment(id: string): Promise<Payment | null> {
  const [row] = await db.select().from(payments).where(eq(payments.id, id)).limit(1);
  return row ?? null;
}

export async function insertPayment(tx: DbExecutor, data: NewPayment): Promise<Payment> {
  const [row] = await tx.insert(payments).values(data).returning();
  if (!row) throw new Error('payments insert returned no row');
  return row;
}

export async function updatePayment(
  tx: DbExecutor,
  id: string,
  patch: Partial<Pick<Payment, 'status' | 'verifiedByUserId' | 'verifiedAt' | 'rejectionReason'>>,
): Promise<Payment> {
  const [row] = await tx.update(payments).set(patch).where(eq(payments.id, id)).returning();
  if (!row) throw new Error(`payment ${id} not found`);
  return row;
}
