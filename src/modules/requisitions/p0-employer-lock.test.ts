import { and, eq, inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db/client';
import { auditEvents } from '@/lib/db/schema/audit_events';
import { invoices } from '@/lib/db/schema/billing';
import { recruitmentCampaigns } from '@/lib/db/schema/campaigns';
import { serviceEngagements } from '@/lib/db/schema/commerce';
import { persons } from '@/lib/db/schema/persons';
import {
  employers,
  jobApplications,
  jobRequisitions,
  placements,
} from '@/lib/db/schema/recruitment';
import { serviceCatalogItems } from '@/lib/db/schema/services';
import { type UserRole, users } from '@/lib/db/schema/users';

/**
 * P0 — job ↔ employer integrity. Editing a job used to be able to move it
 * to another employer with no guard and no audit, silently re-parenting
 * its campaign, applications, placements and invoices. Now:
 *  - once a job has any activity the employer change is refused with
 *    "This job already has activity for <Employer>. Create a new job…";
 *  - with no activity the change is allowed and audited (employerId
 *    before / after);
 *  - the CREATED audit records the status.
 * Real DB, mocked RECRUITER session (real role presets).
 */

const session = {
  user: {
    id: '',
    email: 'p0-lock@example.test',
    name: 'P0 Lock Tester',
    role: 'RECRUITER' as UserRole,
    isOwner: false,
    personId: null,
    employerId: null,
  },
};
vi.mock('@/lib/auth/session', async () => {
  const { AuthorizationError } = await import('@/lib/errors');
  const { presetForRole, hasPermission, encodeKey } = await import('@/lib/auth/permissions');
  const INTERNAL = ['ADMIN', 'STAFF', 'MANAGER', 'RECRUITER', 'DOCUMENT_SPECIALIST', 'FINANCE'];
  const granted = () =>
    new Set(
      presetForRole(session.user.role as Parameters<typeof presetForRole>[0]).map((k) =>
        encodeKey(k.business, k.module, k.verb),
      ),
    );
  return {
    requireInternalStaff: vi.fn(async () => {
      if (!INTERNAL.includes(session.user.role)) throw new AuthorizationError();
      return session;
    }),
    requirePermission: vi.fn(async (b: string, m: string, v: string) => {
      if (!session.user.isOwner && !hasPermission(granted(), b as 'recruitment', m, v as 'edit')) {
        throw new AuthorizationError();
      }
      return session;
    }),
  };
});

const svc = await import('./service');

const STAMP = `vitest-p0lock-${Date.now()}`;
const ids = { sunrise: '', bayview: '', person: '', jobs: [] as string[] };

async function newJob(tag: string) {
  const job = await svc.upsertRequisition({
    employerId: ids.sunrise,
    title: `${STAMP} ${tag}`,
    positionsRequired: 2,
    employmentType: 'FULL_TIME',
    status: 'OPEN',
  });
  ids.jobs.push(job.id);
  return job;
}

/** Same values, other employer (what the edit dialog would send). */
const moveTo = (job: Awaited<ReturnType<typeof newJob>>, employerId: string) =>
  svc.upsertRequisition({
    id: job.id,
    employerId,
    title: job.title,
    positionsRequired: job.positionsRequired,
    employmentType: job.employmentType,
    status: job.status,
  });

beforeAll(async () => {
  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'e2e-admin@ireland-careers.test'))
    .limit(1);
  if (!admin) throw new Error('e2e admin seed missing');
  session.user.id = admin.id;
  const [a, b] = await db
    .insert(employers)
    .values([
      { assignedUserId: admin.id, legalName: `${STAMP} Sunrise Care` },
      { assignedUserId: admin.id, legalName: `${STAMP} Bayview Nursing` },
    ])
    .returning({ id: employers.id });
  if (!a || !b) throw new Error('seed failed');
  ids.sunrise = a.id;
  ids.bayview = b.id;
  const [p] = await db
    .insert(persons)
    .values({ firstName: 'P0Lock', lastName: STAMP, source: 'DIRECT' })
    .returning({ id: persons.id });
  if (!p) throw new Error('seed failed');
  ids.person = p.id;
});

afterAll(async () => {
  const jobIds = ids.jobs;
  if (jobIds.length) {
    const apps = (
      await db
        .select({ id: jobApplications.id })
        .from(jobApplications)
        .where(inArray(jobApplications.jobRequisitionId, jobIds))
    ).map((a) => a.id);
    const camps = (
      await db
        .select({ id: recruitmentCampaigns.id })
        .from(recruitmentCampaigns)
        .where(like(recruitmentCampaigns.name, `${STAMP}%`))
    ).map((c) => c.id);
    await db
      .delete(auditEvents)
      .where(inArray(auditEvents.entityId, [...jobIds, ...apps, ...camps, ids.person]));
    await db.delete(placements).where(inArray(placements.jobRequisitionId, jobIds));
    if (apps.length) await db.delete(jobApplications).where(inArray(jobApplications.id, apps));
    if (camps.length)
      await db.delete(recruitmentCampaigns).where(inArray(recruitmentCampaigns.id, camps));
    await db.delete(jobRequisitions).where(inArray(jobRequisitions.id, jobIds));
  }
  await db.delete(persons).where(eq(persons.id, ids.person));
  await db.delete(employers).where(inArray(employers.id, [ids.sunrise, ids.bayview]));
});

describe('job employer change', () => {
  it('records the status in the CREATED audit', async () => {
    const job = await newJob('created');
    const [created] = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.entityId, job.id), eq(auditEvents.action, 'CREATED')));
    expect(created?.after).toMatchObject({ employerId: ids.sunrise, status: 'OPEN' });
  });

  it('with no activity the employer can change, and the audit records before / after', async () => {
    const job = await newJob('free');
    expect(await svc.fetchRequisitionEmployerLock(job.id)).toMatchObject({
      locked: false,
      activity: [],
    });
    const moved = await moveTo(job, ids.bayview);
    expect(moved.employerId).toBe(ids.bayview);
    const [updated] = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.entityId, job.id), eq(auditEvents.action, 'UPDATED')));
    expect(updated?.before).toMatchObject({ employerId: ids.sunrise });
    expect(updated?.after).toMatchObject({ employerId: ids.bayview });
  });

  it('a job with a campaign keeps its employer (refused, clear message); other edits still save', async () => {
    const job = await newJob('campaign');
    await db
      .insert(recruitmentCampaigns)
      .values({ name: `${STAMP} campaign`, jobRequisitionId: job.id, status: 'DRAFT' });
    expect(await svc.fetchRequisitionEmployerLock(job.id)).toMatchObject({
      locked: true,
      activity: ['campaign'],
      employerName: `${STAMP} Sunrise Care`,
    });
    await expect(moveTo(job, ids.bayview)).rejects.toMatchObject({
      code: 'REQUISITION_EMPLOYER_LOCKED',
      message: `This job already has activity for ${STAMP} Sunrise Care. Create a new job for the other employer.`,
    });
    const [row] = await db.select().from(jobRequisitions).where(eq(jobRequisitions.id, job.id));
    expect(row?.employerId).toBe(ids.sunrise);
    // Fixing a typo with the same employer is fine.
    const fixed = await svc.upsertRequisition({
      id: job.id,
      employerId: ids.sunrise,
      title: `${STAMP} campaign (typo fixed)`,
      positionsRequired: 2,
      employmentType: 'FULL_TIME',
      status: 'OPEN',
    });
    expect(fixed.title).toContain('typo fixed');
  });

  it('a job with an application is locked', async () => {
    const job = await newJob('application');
    await db
      .insert(jobApplications)
      .values({ jobRequisitionId: job.id, personId: ids.person, status: 'APPLIED' });
    await expect(moveTo(job, ids.bayview)).rejects.toMatchObject({
      code: 'REQUISITION_EMPLOYER_LOCKED',
    });
  });

  it('a job with a placement is locked', async () => {
    const job = await newJob('placement');
    await db.insert(placements).values({
      personId: ids.person,
      employerId: ids.sunrise,
      jobRequisitionId: job.id,
      status: 'PROPOSED',
    });
    await expect(moveTo(job, ids.bayview)).rejects.toMatchObject({
      code: 'REQUISITION_EMPLOYER_LOCKED',
    });
  });

  it('a job with an invoice counts as activity (checked inside a rolled-back transaction)', async () => {
    const job = await newJob('invoice');
    const [service] = await db
      .select({ id: serviceCatalogItems.id })
      .from(serviceCatalogItems)
      .limit(1);
    if (!service) throw new Error('no service catalog item to attach a fixture invoice to');
    const ROLLBACK = new Error('rollback');
    let seen: string[] = [];
    // The invoice never commits: no finance record is left behind.
    await expect(
      db.transaction(async (tx) => {
        const [eng] = await tx
          .insert(serviceEngagements)
          .values({
            serviceCatalogItemId: service.id,
            payerPersonId: ids.person,
            beneficiaryPersonId: ids.person,
            agreedAmount: '100.00',
            currencyCode: 'EUR',
            status: 'PENDING_PAYMENT',
          })
          .returning({ id: serviceEngagements.id });
        if (!eng) throw new Error('engagement fixture failed');
        await tx.insert(invoices).values({
          number: `TST${Date.now().toString().slice(-12)}`,
          payerPersonId: ids.person,
          serviceEngagementId: eng.id,
          unitPrice: '100.00',
          subtotal: '100.00',
          totalAmount: '100.00',
          currencyCode: 'EUR',
          lineDescription: 'p0 employer-lock fixture',
          issuedByUserId: session.user.id,
          jobRequisitionId: job.id,
        });
        seen = await svc.requisitionActivityKinds(tx, job.id);
        throw ROLLBACK;
      }),
    ).rejects.toBe(ROLLBACK);
    expect(seen).toEqual(['invoice']);
    // Rolled back: the job is free again.
    expect((await svc.fetchRequisitionEmployerLock(job.id)).locked).toBe(false);
  });
});
