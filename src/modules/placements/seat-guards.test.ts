import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db/client';
import { persons } from '@/lib/db/schema/persons';
import {
  employers,
  jobApplications,
  jobRequisitions,
  placements,
} from '@/lib/db/schema/recruitment';
import { users } from '@/lib/db/schema/users';

/**
 * R0 regression matrix for the placement seat guards and the corrected
 * fill-count roll-up.
 *
 * Covers the four defects the Gate A audit proved live ("15 of 2
 * filled"): overfill, duplicate placements, employer mismatch, archived
 * placements counting as seats — plus the terminal-status resurrection,
 * the positions-below-filled rule (D8), the markApplicationPlaced
 * transition bypass, and the requisition-edit status bypass.
 *
 * Hits the real dev DB with VITEST-prefixed rows, deleted in afterAll.
 * Requires the e2e-admin seed (Playwright globalSetup or db:seed).
 */

const mockSession = { user: { id: '', role: 'ADMIN', isOwner: false, email: '', name: '' } };
vi.mock('@/lib/auth/session', () => ({
  requireInternalStaff: vi.fn(async () => mockSession),
  requirePermission: vi.fn(async () => mockSession),
  requireRole: vi.fn(async () => mockSession),
  getSession: vi.fn(async () => mockSession),
  requireSession: vi.fn(async () => mockSession),
  loadCurrentUserPermissions: vi.fn(async () => null),
}));

import { upsertRequisition } from '@/modules/requisitions/service';
import { createPlacement, markApplicationPlaced, updatePlacementStatus } from './service';

const STAMP = `VITEST_SEATS_${Date.now()}`;

let adminId: string;
let employerId: string;
let otherEmployerId: string;
const personIds: string[] = [];

async function seedPerson(n: number): Promise<string> {
  const [p] = await db
    .insert(persons)
    .values({
      firstName: 'Seat',
      lastName: `${STAMP}_${n}`,
      email: `seat-${STAMP.toLowerCase()}-${n}@example.test`,
      source: 'DIRECT',
    })
    .returning({ id: persons.id });
  if (!p) throw new Error('person seed failed');
  personIds.push(p.id);
  return p.id;
}

async function seedRequisition(positions: number, status = 'OPEN' as const) {
  const [r] = await db
    .insert(jobRequisitions)
    .values({
      employerId,
      title: `${STAMP} req ${Math.random().toString(36).slice(2, 6)}`,
      positionsRequired: positions,
      employmentType: 'FULL_TIME',
      status,
      assignedUserId: adminId,
    })
    .returning();
  if (!r) throw new Error('requisition seed failed');
  return r;
}

async function seedApplication(personId: string, requisitionId: string, status: string) {
  const [a] = await db
    .insert(jobApplications)
    .values({
      jobRequisitionId: requisitionId,
      personId,
      source: 'INTERNAL',
      status: status as 'OFFER',
    })
    .returning({ id: jobApplications.id });
  if (!a) throw new Error('application seed failed');
  return a.id;
}

beforeAll(async () => {
  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'e2e-admin@ireland-careers.test'))
    .limit(1);
  if (!admin) throw new Error('e2e admin seed missing');
  adminId = admin.id;
  mockSession.user.id = adminId;

  const [emp] = await db
    .insert(employers)
    .values({ legalName: `${STAMP} Employer Ltd` })
    .returning({ id: employers.id });
  const [other] = await db
    .insert(employers)
    .values({ legalName: `${STAMP} Other Ltd` })
    .returning({ id: employers.id });
  if (!emp || !other) throw new Error('employer seed failed');
  employerId = emp.id;
  otherEmployerId = other.id;
});

afterAll(async () => {
  const reqs = await db
    .select({ id: jobRequisitions.id })
    .from(jobRequisitions)
    .where(eq(jobRequisitions.employerId, employerId));
  for (const r of reqs) {
    await db.delete(placements).where(eq(placements.jobRequisitionId, r.id));
    await db.delete(jobApplications).where(eq(jobApplications.jobRequisitionId, r.id));
  }
  await db.delete(jobRequisitions).where(eq(jobRequisitions.employerId, employerId));
  await db.delete(employers).where(eq(employers.id, employerId));
  await db.delete(employers).where(eq(employers.id, otherEmployerId));
  for (const pid of personIds) {
    await db.delete(persons).where(eq(persons.id, pid));
  }
});

describe('seat guards', () => {
  it('refuses overfilling: the seat after the last one is rejected and the counter stays truthful', async () => {
    const req = await seedRequisition(1);
    const p1 = await seedPerson(1);
    const p2 = await seedPerson(2);
    const app1 = await seedApplication(p1, req.id, 'OFFER');
    const app2 = await seedApplication(p2, req.id, 'OFFER');

    await markApplicationPlaced(app1);
    await expect(markApplicationPlaced(app2)).rejects.toMatchObject({
      code: 'REQUISITION_OVERFILLED',
    });

    const [after] = await db.select().from(jobRequisitions).where(eq(jobRequisitions.id, req.id));
    expect(after?.positionsFilled).toBe(1);
    expect(after?.status).toBe('FILLED');
  });

  it('refuses a duplicate placement for the same person', async () => {
    const req = await seedRequisition(3);
    const p = await seedPerson(3);
    const app = await seedApplication(p, req.id, 'OFFER');
    await markApplicationPlaced(app);

    await expect(
      createPlacement({
        personId: p,
        employerId,
        jobRequisitionId: req.id,
        status: 'CONFIRMED',
      }),
    ).rejects.toMatchObject({ code: 'PLACEMENT_DUPLICATE' });
  });

  it('refuses a placement whose employer does not match the requisition', async () => {
    const req = await seedRequisition(2);
    const p = await seedPerson(4);
    await expect(
      createPlacement({
        personId: p,
        employerId: otherEmployerId,
        jobRequisitionId: req.id,
        status: 'CONFIRMED',
      }),
    ).rejects.toMatchObject({ code: 'PLACEMENT_EMPLOYER_MISMATCH' });
  });

  it('ignores archived placements: an archived confirmed seat neither blocks nor counts', async () => {
    const req = await seedRequisition(1);
    const pOld = await seedPerson(5);
    const pNew = await seedPerson(6);
    await db.insert(placements).values({
      personId: pOld,
      employerId,
      jobRequisitionId: req.id,
      status: 'CONFIRMED',
      archivedAt: new Date(),
      archivedByUserId: adminId,
    });

    const created = await createPlacement({
      personId: pNew,
      employerId,
      jobRequisitionId: req.id,
      status: 'CONFIRMED',
    });
    expect(created.status).toBe('CONFIRMED');

    const [after] = await db.select().from(jobRequisitions).where(eq(jobRequisitions.id, req.id));
    expect(after?.positionsFilled).toBe(1); // not 2 — the archived row no longer counts
    expect(after?.status).toBe('FILLED');
  });

  it('never resurrects a terminal requisition: recompute keeps CLOSED closed', async () => {
    const req = await seedRequisition(2);
    const p = await seedPerson(7);
    const placement = await createPlacement({
      personId: p,
      employerId,
      jobRequisitionId: req.id,
      status: 'CONFIRMED',
    });
    await db
      .update(jobRequisitions)
      .set({ status: 'CLOSED' })
      .where(eq(jobRequisitions.id, req.id));

    await updatePlacementStatus({ placementId: placement.id, status: 'STARTED' });

    const [after] = await db.select().from(jobRequisitions).where(eq(jobRequisitions.id, req.id));
    expect(after?.status).toBe('CLOSED'); // used to flip back to PARTIALLY_FILLED
  });

  it('D8: refuses reducing positions below live confirmed placements', async () => {
    const req = await seedRequisition(2);
    const p1 = await seedPerson(8);
    const p2 = await seedPerson(9);
    for (const pid of [p1, p2]) {
      await createPlacement({
        personId: pid,
        employerId,
        jobRequisitionId: req.id,
        status: 'CONFIRMED',
      });
    }
    await expect(
      upsertRequisition({
        id: req.id,
        employerId,
        title: req.title,
        positionsRequired: 1,
        employmentType: 'FULL_TIME',
        status: 'FILLED',
      }),
    ).rejects.toMatchObject({ code: 'REQUISITION_POSITIONS_BELOW_FILLED' });
  });

  it('recomputes the roll-up when positions are raised: FILLED relaxes to PARTIALLY_FILLED', async () => {
    const req = await seedRequisition(1);
    const p = await seedPerson(10);
    await createPlacement({
      personId: p,
      employerId,
      jobRequisitionId: req.id,
      status: 'CONFIRMED',
    });
    const [filled] = await db.select().from(jobRequisitions).where(eq(jobRequisitions.id, req.id));
    expect(filled?.status).toBe('FILLED');

    await upsertRequisition({
      id: req.id,
      employerId,
      title: req.title,
      positionsRequired: 3,
      employmentType: 'FULL_TIME',
      status: 'FILLED',
    });
    const [after] = await db.select().from(jobRequisitions).where(eq(jobRequisitions.id, req.id));
    expect(after?.positionsRequired).toBe(3);
    expect(after?.status).toBe('PARTIALLY_FILLED');
    expect(after?.positionsFilled).toBe(1);
  });

  it('markApplicationPlaced enforces the application state machine (INTERVIEW cannot jump to placed)', async () => {
    const req = await seedRequisition(2);
    const p = await seedPerson(11);
    const app = await seedApplication(p, req.id, 'INTERVIEW');
    await expect(markApplicationPlaced(app)).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
    });
  });

  it('requisition edits go through the state machine: CLOSED cannot be edited back to OPEN', async () => {
    const req = await seedRequisition(2);
    await db
      .update(jobRequisitions)
      .set({ status: 'CLOSED' })
      .where(eq(jobRequisitions.id, req.id));
    await expect(
      upsertRequisition({
        id: req.id,
        employerId,
        title: req.title,
        positionsRequired: 2,
        employmentType: 'FULL_TIME',
        status: 'OPEN',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });
  });
});
