import { and, eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db/client';
import { auditEvents } from '@/lib/db/schema/audit_events';
import { offers } from '@/lib/db/schema/interviews_offers';
import { persons } from '@/lib/db/schema/persons';
import {
  employers,
  jobApplications,
  jobRequisitions,
  placements,
} from '@/lib/db/schema/recruitment';
import { users } from '@/lib/db/schema/users';

/**
 * R3 decision 6 — a candidate takes a seat on the standard path only with
 * an offer recorded as ACCEPTED in the CRM. Placing without one (external
 * recruitment hires) needs an explicit confirmation plus a reason, and is
 * audited. Covers every seat-taking entry point: markApplicationPlaced
 * (pipeline "Mark placed", candidate "Record placement", R3 "Place
 * candidate"), updatePlacementStatus PROPOSED→CONFIRMED (Placements table)
 * and createPlacement at a seat-holding status. R0 capacity and duplicate
 * guards still run first and are never bypassed by the exception.
 */

const session = { user: { id: '', role: 'ADMIN', isOwner: false, email: '', name: '' } };
vi.mock('@/lib/auth/session', () => ({
  requireInternalStaff: vi.fn(async () => session),
  requirePermission: vi.fn(async () => session),
  requireRole: vi.fn(async () => session),
  getSession: vi.fn(async () => session),
  requireSession: vi.fn(async () => session),
  loadCurrentUserPermissions: vi.fn(async () => null),
}));

const pm = await import('./service');

const STAMP = `VITEST_PLX_${Date.now()}`;
const EXCEPTION = { confirmed: true, reason: 'Hired via external recruitment partner' } as const;
let adminId = '';
let employerId = '';
const reqIds: string[] = [];
const personIds: string[] = [];

async function seedReq(positions: number) {
  const [r] = await db
    .insert(jobRequisitions)
    .values({
      employerId,
      title: `${STAMP} ${Math.random().toString(36).slice(2, 6)}`,
      positionsRequired: positions,
      employmentType: 'FULL_TIME',
      status: 'OPEN',
    })
    .returning({ id: jobRequisitions.id });
  if (!r) throw new Error('seed failed');
  reqIds.push(r.id);
  return r.id;
}

async function seedApp(reqId: string, status: 'OFFER' | 'ACCEPTED' = 'OFFER') {
  const [p] = await db
    .insert(persons)
    .values({ firstName: 'Plx', lastName: STAMP, source: 'DIRECT' })
    .returning({ id: persons.id });
  if (!p) throw new Error('seed failed');
  personIds.push(p.id);
  const [a] = await db
    .insert(jobApplications)
    .values({ personId: p.id, jobRequisitionId: reqId, source: 'INTERNAL', status })
    .returning({ id: jobApplications.id });
  if (!a) throw new Error('seed failed');
  return { personId: p.id, appId: a.id };
}

async function acceptOffer(appId: string) {
  const [o] = await db
    .insert(offers)
    .values({
      jobApplicationId: appId,
      amount: '40000',
      currencyCode: 'EUR',
      status: 'ACCEPTED',
      createdByUserId: adminId,
    })
    .returning({ id: offers.id });
  if (!o) throw new Error('seed failed');
  return o.id;
}

const seatsOf = (reqId: string) =>
  db.select().from(placements).where(eq(placements.jobRequisitionId, reqId));

const exceptionAudits = (placementId: string) =>
  db
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.entityId, placementId),
        eq(auditEvents.action, 'PLACED_WITHOUT_ACCEPTED_OFFER'),
      ),
    );

beforeAll(async () => {
  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'e2e-admin@ireland-careers.test'))
    .limit(1);
  if (!admin) throw new Error('e2e admin seed missing');
  adminId = admin.id;
  session.user.id = adminId;
  const [emp] = await db
    .insert(employers)
    .values({ legalName: `${STAMP} Ltd` })
    .returning({ id: employers.id });
  if (!emp) throw new Error('seed failed');
  employerId = emp.id;
});

afterAll(async () => {
  if (reqIds.length) {
    const pl = await db
      .select({ id: placements.id })
      .from(placements)
      .where(inArray(placements.jobRequisitionId, reqIds));
    const apps = await db
      .select({ id: jobApplications.id })
      .from(jobApplications)
      .where(inArray(jobApplications.jobRequisitionId, reqIds));
    const entityIds = [...reqIds, ...pl.map((p) => p.id), ...apps.map((a) => a.id)];
    await db.delete(auditEvents).where(inArray(auditEvents.entityId, entityIds));
    await db.delete(placements).where(inArray(placements.jobRequisitionId, reqIds));
    await db.delete(jobApplications).where(inArray(jobApplications.jobRequisitionId, reqIds));
    await db.delete(jobRequisitions).where(inArray(jobRequisitions.id, reqIds));
  }
  if (personIds.length) {
    await db
      .delete(auditEvents)
      .where(
        inArray(
          auditEvents.entityId,
          db
            .select({ id: sql<string>`id::text` })
            .from(sql`candidate_profiles`)
            .where(sql`person_id IN ${personIds}`),
        ),
      );
    await db.delete(persons).where(inArray(persons.id, personIds));
  }
  await db.delete(employers).where(eq(employers.id, employerId));
});

describe('placing without an accepted CRM offer', () => {
  it('standard path is unchanged: an accepted offer places with no confirmation or reason', async () => {
    const req = await seedReq(2);
    const { appId } = await seedApp(req);
    const offerId = await acceptOffer(appId);
    const placed = await pm.markApplicationPlaced(appId);
    expect(placed.status).toBe('CONFIRMED');
    expect(await exceptionAudits(placed.id)).toHaveLength(0);
    const [created] = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.entityId, placed.id), eq(auditEvents.action, 'CREATED')));
    expect(created?.context).toMatchObject({ basis: 'accepted_offer', offerId });
  });

  it('Mark placed without an accepted offer is refused and changes nothing', async () => {
    const req = await seedReq(2);
    const { appId } = await seedApp(req);
    await expect(pm.markApplicationPlaced(appId)).rejects.toMatchObject({
      code: 'PLACEMENT_OFFER_REQUIRED',
    });
    expect(await seatsOf(req)).toHaveLength(0);
    const [app] = await db.select().from(jobApplications).where(eq(jobApplications.id, appId));
    expect(app?.status).toBe('OFFER');
  });

  it('a non-accepted offer (sent / negotiating) does not count as accepted', async () => {
    const req = await seedReq(2);
    const { appId } = await seedApp(req);
    await db.insert(offers).values({
      jobApplicationId: appId,
      amount: '40000',
      currencyCode: 'EUR',
      status: 'SENT',
      createdByUserId: adminId,
    });
    await expect(pm.markApplicationPlaced(appId)).rejects.toMatchObject({
      code: 'PLACEMENT_OFFER_REQUIRED',
    });
  });

  it('the exception needs the confirmation ticked and a real reason', async () => {
    const req = await seedReq(2);
    const { appId } = await seedApp(req);
    await expect(
      pm.markApplicationPlaced(appId, { confirmed: false as unknown as true, reason: 'External' }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      fields: { confirmed: expect.any(String) },
    });
    await expect(
      pm.markApplicationPlaced(appId, { confirmed: true, reason: '  ab ' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', fields: { reason: expect.any(String) } });
    expect(await seatsOf(req)).toHaveLength(0);
  });

  it('a confirmed exception places the candidate and audits who, why and when', async () => {
    const req = await seedReq(2);
    const { appId } = await seedApp(req);
    const placed = await pm.markApplicationPlaced(appId, EXCEPTION);
    expect(placed.status).toBe('CONFIRMED');
    const [audit] = await exceptionAudits(placed.id);
    expect(audit?.actorUserId).toBe(adminId);
    expect(audit?.after).toEqual({ reason: EXCEPTION.reason, confirmed: true });
    expect(audit?.context).toMatchObject({ applicationId: appId });
    expect(audit?.occurredAt).toBeInstanceOf(Date);
    const [created] = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.entityId, placed.id), eq(auditEvents.action, 'CREATED')));
    expect(created?.context).toMatchObject({
      basis: 'offer_exception',
      exceptionReason: EXCEPTION.reason,
    });
    // No invoice is raised by placing.
    const [inv] = await db.execute<{ n: number }>(
      sql`SELECT COUNT(*)::int AS n FROM invoices WHERE placement_id = ${placed.id}`,
    );
    expect(inv?.n).toBe(0);
  });

  it('the exception never bypasses capacity: a full job still refuses the next seat', async () => {
    const req = await seedReq(1);
    const first = await seedApp(req);
    const second = await seedApp(req);
    await pm.markApplicationPlaced(first.appId, EXCEPTION);
    await expect(pm.markApplicationPlaced(second.appId, EXCEPTION)).rejects.toMatchObject({
      code: 'REQUISITION_OVERFILLED',
    });
    // Capacity is checked first: no reason is asked for when no seat is free.
    await expect(pm.markApplicationPlaced(second.appId)).rejects.toMatchObject({
      code: 'REQUISITION_OVERFILLED',
    });
    expect(await seatsOf(req)).toHaveLength(1);
  });

  it('the exception never bypasses the duplicate guard', async () => {
    const req = await seedReq(3);
    const { personId, appId } = await seedApp(req);
    await pm.markApplicationPlaced(appId, EXCEPTION);
    await expect(
      pm.createPlacement({
        personId,
        employerId,
        jobRequisitionId: req,
        status: 'CONFIRMED',
        offerException: EXCEPTION,
      }),
    ).rejects.toMatchObject({ code: 'PLACEMENT_DUPLICATE' });
  });

  it('Record placement on an ACCEPTED application (PROPOSED placement) needs the exception too', async () => {
    const req = await seedReq(2);
    const { personId, appId } = await seedApp(req, 'ACCEPTED');
    const [proposed] = await db
      .insert(placements)
      .values({
        personId,
        employerId,
        jobRequisitionId: req,
        jobApplicationId: appId,
        status: 'PROPOSED',
      })
      .returning();
    if (!proposed) throw new Error('seed failed');
    await expect(pm.markApplicationPlaced(appId)).rejects.toMatchObject({
      code: 'PLACEMENT_OFFER_REQUIRED',
    });
    const [still] = await db.select().from(placements).where(eq(placements.id, proposed.id));
    expect(still?.status).toBe('PROPOSED');
    const confirmed = await pm.markApplicationPlaced(appId, EXCEPTION);
    expect(confirmed.id).toBe(proposed.id);
    expect(confirmed.status).toBe('CONFIRMED');
    expect(await exceptionAudits(proposed.id)).toHaveLength(1);
  });

  it('Placements table Confirm (PROPOSED → CONFIRMED) needs the exception without an accepted offer', async () => {
    const req = await seedReq(2);
    const { personId, appId } = await seedApp(req, 'ACCEPTED');
    const proposed = await pm.createPlacement({
      personId,
      employerId,
      jobRequisitionId: req,
      jobApplicationId: appId,
      status: 'PROPOSED',
    });
    await expect(
      pm.updatePlacementStatus({ placementId: proposed.id, status: 'CONFIRMED' }),
    ).rejects.toMatchObject({ code: 'PLACEMENT_OFFER_REQUIRED' });
    const confirmed = await pm.updatePlacementStatus({
      placementId: proposed.id,
      status: 'CONFIRMED',
      offerException: EXCEPTION,
    });
    expect(confirmed.status).toBe('CONFIRMED');
    expect(await exceptionAudits(proposed.id)).toHaveLength(1);
    // Later lifecycle moves of a seat already held need nothing extra.
    const started = await pm.updatePlacementStatus({ placementId: proposed.id, status: 'STARTED' });
    expect(started.status).toBe('STARTED');
  });

  it('Placements table Confirm with an accepted offer needs no exception', async () => {
    const req = await seedReq(2);
    const { personId, appId } = await seedApp(req, 'ACCEPTED');
    await acceptOffer(appId);
    const proposed = await pm.createPlacement({
      personId,
      employerId,
      jobRequisitionId: req,
      jobApplicationId: appId,
      status: 'PROPOSED',
    });
    const confirmed = await pm.updatePlacementStatus({
      placementId: proposed.id,
      status: 'CONFIRMED',
    });
    expect(confirmed.status).toBe('CONFIRMED');
    expect(await exceptionAudits(proposed.id)).toHaveLength(0);
  });

  it('createPlacement at a seat-holding status needs the exception; PROPOSED does not', async () => {
    const req = await seedReq(3);
    const a = await seedApp(req);
    await expect(
      pm.createPlacement({
        personId: a.personId,
        employerId,
        jobRequisitionId: req,
        status: 'CONFIRMED',
      }),
    ).rejects.toMatchObject({ code: 'PLACEMENT_OFFER_REQUIRED' });
    const proposed = await pm.createPlacement({
      personId: a.personId,
      employerId,
      jobRequisitionId: req,
      status: 'PROPOSED',
    });
    expect(proposed.status).toBe('PROPOSED');
    const b = await seedApp(req);
    const created = await pm.createPlacement({
      personId: b.personId,
      employerId,
      jobRequisitionId: req,
      status: 'CONFIRMED',
      offerException: EXCEPTION,
    });
    expect(await exceptionAudits(created.id)).toHaveLength(1);
  });
});
