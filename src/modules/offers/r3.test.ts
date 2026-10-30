import { and, eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db/client';
import { auditEvents } from '@/lib/db/schema/audit_events';
import { interviews, offers } from '@/lib/db/schema/interviews_offers';
import { persons } from '@/lib/db/schema/persons';
import {
  employers,
  jobApplications,
  jobRequisitions,
  placements,
} from '@/lib/db/schema/recruitment';
import { type UserRole, users } from '@/lib/db/schema/users';

/**
 * R3 — interviews, offers and the placement hand-off, against the real DB.
 * Permission checks are evaluated from the real role presets (STAFF has no
 * recruitment.interviews grant; RECRUITER does), so the matrix reflects
 * what each role actually gets.
 */

const session = {
  user: {
    id: '',
    email: 'r3@example.test',
    name: 'R3 Tester',
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
      if (
        !session.user.isOwner &&
        !hasPermission(granted(), b as 'recruitment', m as 'interviews', v as 'edit')
      ) {
        throw new AuthorizationError();
      }
      return session;
    }),
  };
});

const im = await import('@/modules/interviews/manage');
const om = await import('./service');
const pm = await import('@/modules/placements/service');

const STAMP = `vitest-r3-${Date.now()}`;
const ids = {
  user: '',
  employer: '',
  otherEmployer: '',
  req: '',
  closedReq: '',
  persons: [] as string[],
};

function future(hours: number): { localDateTime: string; timeZone: string } {
  const d = new Date(Date.now() + hours * 3600_000);
  const iso = d.toISOString();
  return { localDateTime: iso.slice(0, 16), timeZone: 'UTC' };
}

async function seedPerson(n: string): Promise<string> {
  const [p] = await db
    .insert(persons)
    .values({ firstName: 'R3', lastName: `${STAMP}_${n}`, source: 'DIRECT' })
    .returning({ id: persons.id });
  if (!p) throw new Error('seed');
  ids.persons.push(p.id);
  return p.id;
}

async function seedApp(
  personId: string,
  status: 'SHORTLISTED' | 'INTERVIEW' | 'OFFER' | 'REJECTED' = 'SHORTLISTED',
  requisitionId = ids.req,
): Promise<string> {
  const [a] = await db
    .insert(jobApplications)
    .values({ personId, jobRequisitionId: requisitionId, status })
    .returning({ id: jobApplications.id });
  if (!a) throw new Error('seed');
  return a.id;
}

beforeAll(async () => {
  const [u] = await db
    .insert(users)
    .values({
      email: `${STAMP}@example.test`,
      fullName: 'R3 Tester',
      role: 'RECRUITER',
      passwordHash: 'x',
    })
    .returning({ id: users.id });
  const [e] = await db
    .insert(employers)
    .values({ assignedUserId: u?.id, legalName: `R3 Employer ${STAMP}` })
    .returning({ id: employers.id });
  if (!u || !e) throw new Error('seed');
  ids.user = u.id;
  ids.employer = e.id;
  session.user.id = u.id;
  const [r, c] = await db
    .insert(jobRequisitions)
    .values([
      {
        assignedUserId: u.id,
        employerId: e.id,
        title: `R3 Open ${STAMP}`,
        positionsRequired: 1,
        employmentType: 'FULL_TIME',
        status: 'OPEN',
      },
      {
        assignedUserId: u.id,
        employerId: e.id,
        title: `R3 Closed ${STAMP}`,
        positionsRequired: 1,
        employmentType: 'FULL_TIME',
        status: 'CLOSED',
      },
    ])
    .returning({ id: jobRequisitions.id });
  if (!r || !c) throw new Error('seed');
  ids.req = r.id;
  ids.closedReq = c.id;
});

beforeEach(() => {
  session.user.role = 'RECRUITER';
  session.user.isOwner = false;
});

afterAll(async () => {
  const reqs = [ids.req, ids.closedReq];
  const appIds = (
    await db
      .select({ id: jobApplications.id })
      .from(jobApplications)
      .where(inArray(jobApplications.jobRequisitionId, reqs))
  ).map((r) => r.id);
  if (appIds.length) {
    await db.delete(offers).where(inArray(offers.jobApplicationId, appIds));
    await db.delete(interviews).where(inArray(interviews.jobApplicationId, appIds));
  }
  await db.execute(sql`DELETE FROM audit_events WHERE actor_user_id = ${ids.user}`);
  await db.delete(placements).where(inArray(placements.jobRequisitionId, reqs));
  await db.delete(jobApplications).where(inArray(jobApplications.jobRequisitionId, reqs));
  await db.delete(jobRequisitions).where(inArray(jobRequisitions.id, reqs));
  await db.delete(persons).where(inArray(persons.id, ids.persons));
  await db.delete(employers).where(eq(employers.id, ids.employer));
  await db.delete(users).where(eq(users.id, ids.user));
});

describe('interviews', () => {
  it('scheduling a shortlisted candidate moves the application to INTERVIEW (audited) and records round 1', async () => {
    const appId = await seedApp(await seedPerson('s1'));
    const iv = await im.scheduleInterview({
      applicationId: appId,
      ...future(48),
      mode: 'VIDEO',
      location: 'https://meet.example/abc',
    });
    expect(iv).toMatchObject({ status: 'SCHEDULED', round: 1, outcome: 'PENDING' });
    const [app] = await db.select().from(jobApplications).where(eq(jobApplications.id, appId));
    expect(app?.status).toBe('INTERVIEW');
    const audits = await db.select().from(auditEvents).where(eq(auditEvents.entityId, appId));
    expect(audits.some((a) => a.action === 'STATUS_CHANGED')).toBe(true);
    const iv2 = await im.scheduleInterview({
      applicationId: appId,
      ...future(72),
      mode: 'IN_PERSON',
    });
    expect(iv2.round).toBe(2);
  });

  it('converts the entered timezone to the exact instant', async () => {
    const appId = await seedApp(await seedPerson('tz'), 'INTERVIEW');
    const iv = await im.scheduleInterview({
      applicationId: appId,
      localDateTime: '2031-07-01T10:00',
      timeZone: 'Europe/Dublin',
      mode: 'PHONE',
    });
    expect(iv.scheduledAt.toISOString()).toBe('2031-07-01T09:00:00.000Z');
  });

  it('refuses past times, unknown timezones and invalid durations', async () => {
    const appId = await seedApp(await seedPerson('inv'), 'INTERVIEW');
    await expect(
      im.scheduleInterview({ applicationId: appId, ...future(-1), mode: 'VIDEO' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      im.scheduleInterview({
        applicationId: appId,
        localDateTime: '2031-07-01T10:00',
        timeZone: 'Mars/Base',
        mode: 'VIDEO',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      im.scheduleInterview({
        applicationId: appId,
        ...future(24),
        mode: 'VIDEO',
        durationMinutes: 2,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('refuses a duplicate slot, including two simultaneous submits', async () => {
    const appId = await seedApp(await seedPerson('dup'), 'INTERVIEW');
    const when = future(30);
    const results = await Promise.allSettled([
      im.scheduleInterview({ applicationId: appId, ...when, mode: 'VIDEO' }),
      im.scheduleInterview({ applicationId: appId, ...when, mode: 'VIDEO' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rows = await db.select().from(interviews).where(eq(interviews.jobApplicationId, appId));
    expect(rows).toHaveLength(1);
  });

  it('refuses closed jobs and rejected applications', async () => {
    const closedApp = await seedApp(await seedPerson('cl'), 'INTERVIEW', ids.closedReq);
    await expect(
      im.scheduleInterview({ applicationId: closedApp, ...future(24), mode: 'VIDEO' }),
    ).rejects.toMatchObject({ code: 'REQUISITION_NOT_ACTIVE' });
    const rejected = await seedApp(await seedPerson('rj'), 'REJECTED');
    await expect(
      im.scheduleInterview({ applicationId: rejected, ...future(24), mode: 'VIDEO' }),
    ).rejects.toMatchObject({ code: 'APPLICATION_NOT_INTERVIEWABLE' });
  });

  it('STAFF (no recruitment.interviews grant) is refused; RECRUITER and owner are allowed', async () => {
    const appId = await seedApp(await seedPerson('perm'), 'INTERVIEW');
    session.user.role = 'STAFF';
    await expect(
      im.scheduleInterview({ applicationId: appId, ...future(24), mode: 'VIDEO' }),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_ERROR' });
    session.user.role = 'FINANCE';
    await expect(
      im.scheduleInterview({ applicationId: appId, ...future(24), mode: 'VIDEO' }),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_ERROR' });
    session.user.role = 'STAFF';
    session.user.isOwner = true;
    await expect(
      im.scheduleInterview({ applicationId: appId, ...future(25), mode: 'VIDEO' }),
    ).resolves.toBeTruthy();
  });

  it('edit reschedules (audited RESCHEDULED); cancel needs a reason; results only after the time', async () => {
    const appId = await seedApp(await seedPerson('lc'), 'INTERVIEW');
    const iv = await im.scheduleInterview({ applicationId: appId, ...future(24), mode: 'VIDEO' });
    await im.updateInterview({ interviewId: iv.id, ...future(26), mode: 'PHONE', notes: 'moved' });
    const [aud] = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.entityId, iv.id), eq(auditEvents.action, 'RESCHEDULED')));
    expect(aud).toBeTruthy();
    await expect(
      im.recordInterviewResult({ interviewId: iv.id, result: 'COMPLETED', outcome: 'PASS' }),
    ).rejects.toMatchObject({ code: 'INTERVIEW_NOT_YET_HELD' });
    await expect(im.cancelInterview({ interviewId: iv.id, reason: 'x' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    const cancelled = await im.cancelInterview({
      interviewId: iv.id,
      reason: 'Employer postponed',
    });
    expect(cancelled.status).toBe('CANCELLED');
    await expect(
      im.updateInterview({ interviewId: iv.id, ...future(30), mode: 'VIDEO' }),
    ).rejects.toMatchObject({ code: 'INTERVIEW_NOT_EDITABLE' });
    await expect(
      im.cancelInterview({ interviewId: iv.id, reason: 'again please' }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });
  });

  it('records result + feedback after the time; feedback appends with author; outcome required', async () => {
    const appId = await seedApp(await seedPerson('res'), 'INTERVIEW');
    const [past] = await db
      .insert(interviews)
      .values({
        jobApplicationId: appId,
        scheduledAt: new Date(Date.now() - 3600_000),
        mode: 'VIDEO',
        scheduledByUserId: ids.user,
        notes: 'Prep: ask about nights',
      })
      .returning();
    if (!past) throw new Error('seed');
    await expect(
      im.recordInterviewResult({ interviewId: past.id, result: 'COMPLETED' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const done = await im.recordInterviewResult({
      interviewId: past.id,
      result: 'COMPLETED',
      outcome: 'HOLD',
      feedback: 'Strong clinical answers',
    });
    expect(done).toMatchObject({ status: 'COMPLETED', outcome: 'HOLD' });
    expect(done.notes).toContain('Prep: ask about nights');
    expect(done.notes).toContain('Feedback — R3 Tester');
    const upd = await im.updateInterviewFeedback({
      interviewId: past.id,
      outcome: 'PASS',
      feedback: 'Reference check fine',
    });
    expect(upd.outcome).toBe('PASS');
    expect(upd.notes?.match(/Feedback —/g)).toHaveLength(2);
  });
});

describe('offers', () => {
  const terms = { amount: '32000', currencyCode: 'EUR', period: 'ANNUAL' as const };

  it('creating an offer moves INTERVIEW → OFFER and starts as DRAFT', async () => {
    const appId = await seedApp(await seedPerson('o1'), 'INTERVIEW');
    const o = await om.createOffer({ applicationId: appId, ...terms });
    expect(o.status).toBe('DRAFT');
    const [app] = await db.select().from(jobApplications).where(eq(jobApplications.id, appId));
    expect(app?.status).toBe('OFFER');
  });

  it('refuses offers before the interview stage, bad currency and past dates', async () => {
    const early = await seedApp(await seedPerson('o2'));
    await expect(om.createOffer({ applicationId: early, ...terms })).rejects.toMatchObject({
      code: 'APPLICATION_NOT_AT_OFFER_STAGE',
    });
    const appId = await seedApp(await seedPerson('o3'), 'INTERVIEW');
    await expect(
      om.createOffer({ applicationId: appId, ...terms, currencyCode: 'ZZZ' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      om.createOffer({ applicationId: appId, ...terms, expiresOn: '2020-01-01' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      om.createOffer({ applicationId: appId, ...terms, amount: '0' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('only one open offer per application, also under simultaneous submits', async () => {
    const appId = await seedApp(await seedPerson('o4'), 'INTERVIEW');
    const results = await Promise.allSettled([
      om.createOffer({ applicationId: appId, ...terms }),
      om.createOffer({ applicationId: appId, ...terms }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    await expect(om.createOffer({ applicationId: appId, ...terms })).rejects.toMatchObject({
      code: 'OFFER_ALREADY_OPEN',
    });
  });

  it('follows the accepted offer state machine and audits each step', async () => {
    const appId = await seedApp(await seedPerson('o5'), 'INTERVIEW');
    const o = await om.createOffer({ applicationId: appId, ...terms });
    await expect(om.transitionOffer({ offerId: o.id, to: 'ACCEPTED' })).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
    });
    const sent = await om.transitionOffer({ offerId: o.id, to: 'SENT' });
    expect(sent.sentAt).toBeTruthy();
    await expect(
      om.updateOffer({ offerId: o.id, ...terms, amount: '33000' }),
    ).rejects.toMatchObject({ code: 'OFFER_NOT_EDITABLE' });
    await om.transitionOffer({ offerId: o.id, to: 'NEGOTIATING' });
    const revised = await om.updateOffer({ offerId: o.id, ...terms, amount: '34000' });
    expect(revised.amount).toBe('34000.00');
    // The accepted machine has no NEGOTIATING → ACCEPTED edge: re-send first.
    await expect(om.transitionOffer({ offerId: o.id, to: 'ACCEPTED' })).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
    });
    await om.transitionOffer({ offerId: o.id, to: 'SENT' });
    await expect(om.transitionOffer({ offerId: o.id, to: 'REJECTED' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    const accepted = await om.transitionOffer({ offerId: o.id, to: 'ACCEPTED' });
    await expect(om.transitionOffer({ offerId: o.id, to: 'ACCEPTED' })).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
    });
    expect(accepted.respondedAt).toBeTruthy();
    const audits = await db
      .select({ action: auditEvents.action })
      .from(auditEvents)
      .where(eq(auditEvents.entityId, o.id));
    expect(audits.map((a) => a.action)).toEqual(
      expect.arrayContaining([
        'CREATED',
        'STATUS_SENT',
        'STATUS_NEGOTIATING',
        'UPDATED',
        'STATUS_ACCEPTED',
      ]),
    );
    await expect(om.createOffer({ applicationId: appId, ...terms })).rejects.toMatchObject({
      code: 'OFFER_ALREADY_ACCEPTED',
    });
  });

  it('acceptance does not place the candidate, raise invoices or touch payments', async () => {
    const appId = await seedApp(await seedPerson('o6'), 'INTERVIEW');
    const o = await om.createOffer({ applicationId: appId, ...terms });
    await om.transitionOffer({ offerId: o.id, to: 'SENT' });
    await om.transitionOffer({ offerId: o.id, to: 'ACCEPTED' });
    const pl = await db.select().from(placements).where(eq(placements.jobRequisitionId, ids.req));
    expect(pl.filter((p) => ids.persons.includes(p.personId))).toHaveLength(0);
    const [inv] = await db.execute<{ n: number }>(
      sql`SELECT COUNT(*)::int AS n FROM invoices WHERE job_requisition_id = ${ids.req}`,
    );
    expect(inv?.n).toBe(0);
    const [app] = await db.select().from(jobApplications).where(eq(jobApplications.id, appId));
    expect(app?.status).toBe('OFFER');
  });

  it('placement hand-off uses R0 guards: first placement fills the seat, the next is refused (no overfill)', async () => {
    const a1 = await seedApp(await seedPerson('p1'), 'INTERVIEW');
    const a2 = await seedApp(await seedPerson('p2'), 'INTERVIEW');
    for (const a of [a1, a2]) {
      const o = await om.createOffer({ applicationId: a, ...terms });
      await om.transitionOffer({ offerId: o.id, to: 'SENT' });
      await om.transitionOffer({ offerId: o.id, to: 'ACCEPTED' });
    }
    const placed = await pm.markApplicationPlaced(a1);
    expect(placed.status).toBe('CONFIRMED');
    await expect(pm.markApplicationPlaced(a2)).rejects.toMatchObject({
      code: 'REQUISITION_OVERFILLED',
    });
  });

  it('STAFF cannot create or change offers', async () => {
    const appId = await seedApp(await seedPerson('o7'), 'INTERVIEW');
    session.user.role = 'STAFF';
    await expect(om.createOffer({ applicationId: appId, ...terms })).rejects.toMatchObject({
      code: 'AUTHORIZATION_ERROR',
    });
  });
});
