import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db/client';
import { auditEvents } from '@/lib/db/schema/audit_events';
import { interviews, offers } from '@/lib/db/schema/interviews_offers';
import { persons } from '@/lib/db/schema/persons';
import { employers, jobApplications, jobRequisitions } from '@/lib/db/schema/recruitment';
import { type UserRole, users } from '@/lib/db/schema/users';

/**
 * R2 — workspace read queries: activity is scoped to ONE job and its own
 * related records, paginated newest-first; interviews & offers are listed
 * read-only for that job only; both refuse non-internal users.
 */

const session = {
  user: {
    id: '',
    email: '',
    name: '',
    role: 'STAFF' as UserRole,
    isOwner: false,
    personId: null,
    employerId: null,
  },
};
vi.mock('@/lib/auth/session', async () => {
  const { AuthorizationError } = await import('@/lib/errors');
  const INTERNAL = ['ADMIN', 'STAFF', 'MANAGER', 'RECRUITER', 'DOCUMENT_SPECIALIST', 'FINANCE'];
  return {
    requireInternalStaff: vi.fn(async () => {
      if (!INTERNAL.includes(session.user.role)) throw new AuthorizationError();
      return session;
    }),
  };
});

const { fetchRequisitionActivity, listInterviewsAndOffersForRequisition } = await import(
  './workspace'
);

const STAMP = `vitest-r2ws-${Date.now()}`;
let actorId = '';
let employerId = '';
let reqA = '';
let reqB = '';
let appA = '';
let appB = '';
let personId = '';
const auditIds: string[] = [];

async function audit(entityType: string, entityId: string, action: string, minutesAgo: number) {
  const [row] = await db
    .insert(auditEvents)
    .values({
      actorUserId: actorId,
      entityType,
      entityId,
      action,
      occurredAt: new Date(Date.now() - minutesAgo * 60_000),
      before: { status: 'APPLIED' },
      after: { status: 'INTERVIEW' },
    })
    .returning({ id: auditEvents.id });
  if (row) auditIds.push(row.id);
}

beforeAll(async () => {
  const [u] = await db
    .insert(users)
    .values({
      email: `${STAMP}@example.test`,
      fullName: 'R2 Actor',
      role: 'STAFF',
      passwordHash: 'x',
    })
    .returning({ id: users.id });
  const [e] = await db
    .insert(employers)
    .values({ assignedUserId: u?.id, legalName: `R2 WS Ltd ${STAMP}` })
    .returning({ id: employers.id });
  const [p] = await db
    .insert(persons)
    .values({
      firstName: 'Ria',
      lastName: STAMP,
      email: `${STAMP}-p@example.test`,
      source: 'DIRECT',
    })
    .returning({ id: persons.id });
  if (!u || !e || !p) throw new Error('seed failed');
  actorId = u.id;
  employerId = e.id;
  personId = p.id;
  session.user.id = actorId;
  const [a, b] = await db
    .insert(jobRequisitions)
    .values([
      {
        assignedUserId: actorId,
        employerId,
        title: `R2 A ${STAMP}`,
        positionsRequired: 1,
        employmentType: 'FULL_TIME',
        status: 'OPEN',
      },
      {
        assignedUserId: actorId,
        employerId,
        title: `R2 B ${STAMP}`,
        positionsRequired: 1,
        employmentType: 'FULL_TIME',
        status: 'OPEN',
      },
    ])
    .returning({ id: jobRequisitions.id });
  if (!a || !b) throw new Error('seed failed');
  reqA = a.id;
  reqB = b.id;
  const [aa, ab] = await db
    .insert(jobApplications)
    .values([
      { personId, jobRequisitionId: reqA, status: 'INTERVIEW' },
      { personId, jobRequisitionId: reqB, status: 'INTERVIEW' },
    ])
    .returning({ id: jobApplications.id });
  if (!aa || !ab) throw new Error('seed failed');
  appA = aa.id;
  appB = ab.id;

  // 27 events for job A (job row + its application), 3 for job B.
  for (let i = 0; i < 20; i++) await audit('job_requisition', reqA, 'UPDATED', i + 1);
  for (let i = 0; i < 7; i++) await audit('job_application', appA, 'STATUS_CHANGED', 30 + i);
  await audit('job_requisition', reqB, 'UPDATED', 2);
  await audit('job_application', appB, 'STATUS_CHANGED', 3);
  await audit('employer', employerId, 'UPDATED', 4);

  await db.insert(interviews).values({
    jobApplicationId: appA,
    scheduledAt: new Date('2026-11-03T10:00:00Z'),
    mode: 'VIDEO',
    round: 1,
    status: 'SCHEDULED',
    scheduledByUserId: actorId,
  });
  await db.insert(interviews).values({
    jobApplicationId: appB,
    scheduledAt: new Date('2026-11-04T10:00:00Z'),
    mode: 'PHONE',
    round: 1,
    status: 'SCHEDULED',
    scheduledByUserId: actorId,
  });
  await db.insert(offers).values({
    jobApplicationId: appA,
    amount: '42000.00',
    currencyCode: 'EUR',
    period: 'ANNUAL',
    status: 'DRAFT',
    createdByUserId: actorId,
  });
});

afterAll(async () => {
  await db.delete(auditEvents).where(inArray(auditEvents.id, auditIds));
  await db.delete(offers).where(inArray(offers.jobApplicationId, [appA, appB]));
  await db.delete(interviews).where(inArray(interviews.jobApplicationId, [appA, appB]));
  await db.delete(jobApplications).where(inArray(jobApplications.id, [appA, appB]));
  await db.delete(jobRequisitions).where(inArray(jobRequisitions.id, [reqA, reqB]));
  await db.delete(persons).where(eq(persons.id, personId));
  await db.delete(employers).where(eq(employers.id, employerId));
  await db.delete(users).where(eq(users.id, actorId));
});

describe('fetchRequisitionActivity', () => {
  it('returns only this job and its own records, newest first, 25 per page', async () => {
    session.user.role = 'STAFF';
    const p1 = await fetchRequisitionActivity(reqA);
    expect(p1.rows).toHaveLength(25);
    expect(p1.hasMore).toBe(true);
    const p2 = await fetchRequisitionActivity(reqA, { page: 2 });
    expect(p2.rows).toHaveLength(2);
    expect(p2.hasMore).toBe(false);
    const all = [...p1.rows, ...p2.rows];
    expect(new Set(all.map((r) => r.id)).size).toBe(27);
    // Nothing from job B, nothing from the employer row.
    expect(
      all.every((r) => r.entityType === 'job_requisition' || r.entityType === 'job_application'),
    ).toBe(true);
    const times = all.map((r) => r.occurredAt.getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect(all.every((r) => r.actorName === 'R2 Actor')).toBe(true);
  });

  it('describes status changes from the audit before/after', async () => {
    const { rows } = await fetchRequisitionActivity(reqB);
    const app = rows.find((r) => r.entityType === 'job_application');
    expect(app?.summary).toBe('Application status changed: APPLIED → INTERVIEW');
  });

  it('refuses non-internal users and unknown jobs', async () => {
    session.user.role = 'CANDIDATE';
    await expect(fetchRequisitionActivity(reqA)).rejects.toMatchObject({
      code: 'AUTHORIZATION_ERROR',
    });
    session.user.role = 'STAFF';
    await expect(
      fetchRequisitionActivity('00000000-0000-0000-0000-000000000000'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('listInterviewsAndOffersForRequisition (read-only)', () => {
  it("lists only this job's interviews and offers", async () => {
    session.user.role = 'RECRUITER';
    const a = await listInterviewsAndOffersForRequisition(reqA);
    expect(a.interviews).toHaveLength(1);
    expect(a.interviews[0]).toMatchObject({ mode: 'VIDEO', personName: `Ria ${STAMP}` });
    expect(a.offers).toHaveLength(1);
    expect(a.offers[0]).toMatchObject({ amount: '42000.00', status: 'DRAFT' });
    const b = await listInterviewsAndOffersForRequisition(reqB);
    expect(b.interviews).toHaveLength(1);
    expect(b.offers).toHaveLength(0);
  });

  it('refuses non-internal users', async () => {
    session.user.role = 'EMPLOYER';
    await expect(listInterviewsAndOffersForRequisition(reqA)).rejects.toMatchObject({
      code: 'AUTHORIZATION_ERROR',
    });
    session.user.role = 'STAFF';
  });
});
