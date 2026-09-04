import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db/client';
import { interviews } from '@/lib/db/schema/interviews_offers';
import { persons } from '@/lib/db/schema/persons';
import { employers, jobApplications, jobRequisitions } from '@/lib/db/schema/recruitment';
import { users } from '@/lib/db/schema/users';
import { assertNoTimeConflict } from './conflict-check';

/**
 * Regression test for the interview time-conflict guard.
 *
 * Prior behavior: `scheduleInterview` and `rescheduleInterview` accepted any
 * scheduledAt without checking whether the candidate already had another
 * interview overlapping the proposed window. A recruiter could double-book.
 *
 * Fix: `assertNoTimeConflict` runs inside both service functions; rejects
 * with `INTERVIEW_TIME_CONFLICT` when overlap detected.
 */

const PREFIX = `VITEST_IV_CONFLICT_${Date.now()}`;

let adminUserId: string;
let personId: string;
let employerId: string;
let requisitionId: string;
let applicationId: string;
let existingInterviewId: string;

beforeAll(async () => {
  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'e2e-admin@ireland-careers.test'))
    .limit(1);
  if (!admin) {
    throw new Error(
      'e2e-admin seed missing — run `node_modules/.bin/playwright test --project=admin` once first',
    );
  }
  adminUserId = admin.id;

  const [p] = await db
    .insert(persons)
    .values({
      firstName: `${PREFIX}_first`,
      lastName: `${PREFIX}_last`,
      email: `${PREFIX.toLowerCase()}@example.test`,
      source: 'DIRECT',
    })
    .returning();
  if (!p) throw new Error('person insert failed');
  personId = p.id;

  const [e] = await db
    .insert(employers)
    .values({ legalName: `${PREFIX}_employer`, relationshipStatus: 'ACTIVE' })
    .returning();
  if (!e) throw new Error('employer insert failed');
  employerId = e.id;

  const [r] = await db
    .insert(jobRequisitions)
    .values({
      employerId,
      title: `${PREFIX}_req`,
      status: 'OPEN',
      positionsRequired: 1,
    })
    .returning();
  if (!r) throw new Error('requisition insert failed');
  requisitionId = r.id;

  const [a] = await db
    .insert(jobApplications)
    .values({
      jobRequisitionId: requisitionId,
      personId,
      source: 'INTERNAL',
      status: 'INTERVIEW',
    })
    .returning();
  if (!a) throw new Error('application insert failed');
  applicationId = a.id;

  // Seed one existing interview at 2027-01-15 10:00 UTC, 60 min.
  const [iv] = await db
    .insert(interviews)
    .values({
      jobApplicationId: applicationId,
      scheduledAt: new Date('2027-01-15T10:00:00.000Z'),
      durationMinutes: 60,
      mode: 'VIDEO',
      round: 1,
      scheduledByUserId: adminUserId,
      status: 'SCHEDULED',
      outcome: 'PENDING',
    })
    .returning();
  if (!iv) throw new Error('interview insert failed');
  existingInterviewId = iv.id;
});

afterAll(async () => {
  if (applicationId) {
    await db.delete(interviews).where(eq(interviews.jobApplicationId, applicationId));
    await db.delete(jobApplications).where(eq(jobApplications.id, applicationId));
  }
  if (requisitionId) await db.delete(jobRequisitions).where(eq(jobRequisitions.id, requisitionId));
  if (employerId) await db.delete(employers).where(eq(employers.id, employerId));
  if (personId) await db.delete(persons).where(eq(persons.id, personId));
});

describe('assertNoTimeConflict', () => {
  it('rejects an interview whose window overlaps an existing SCHEDULED one', async () => {
    // Proposed: 10:30 for 60min → overlaps existing 10:00-11:00.
    await expect(
      db.transaction(async (tx) => {
        await assertNoTimeConflict(tx, {
          jobApplicationId: applicationId,
          scheduledAt: new Date('2027-01-15T10:30:00.000Z'),
          durationMinutes: 60,
        });
      }),
    ).rejects.toThrow(/INTERVIEW_TIME_CONFLICT|already has an interview/);
  });

  it('rejects an interview that starts before existing but overlaps into it', async () => {
    // Proposed: 09:30 for 60min → runs until 10:30, overlaps existing 10:00.
    await expect(
      db.transaction(async (tx) => {
        await assertNoTimeConflict(tx, {
          jobApplicationId: applicationId,
          scheduledAt: new Date('2027-01-15T09:30:00.000Z'),
          durationMinutes: 60,
        });
      }),
    ).rejects.toThrow(/INTERVIEW_TIME_CONFLICT|already has an interview/);
  });

  it('rejects a 0-minute-away probe (starts exactly when existing ends)', async () => {
    // Proposed: 11:00 for 60min → touches boundary. Overlap is strict less-than,
    // so touching-at-boundary should NOT conflict.
    await expect(
      db.transaction(async (tx) => {
        await assertNoTimeConflict(tx, {
          jobApplicationId: applicationId,
          scheduledAt: new Date('2027-01-15T11:00:00.000Z'),
          durationMinutes: 60,
        });
      }),
    ).resolves.toBeUndefined();
  });

  it('allows a slot the next day (way outside the 6-hour window)', async () => {
    await expect(
      db.transaction(async (tx) => {
        await assertNoTimeConflict(tx, {
          jobApplicationId: applicationId,
          scheduledAt: new Date('2027-01-16T10:00:00.000Z'),
          durationMinutes: 60,
        });
      }),
    ).resolves.toBeUndefined();
  });

  it('with ignoreInterviewId skips the row being rescheduled (self-conflict guard)', async () => {
    // Rescheduling the existing interview to 10:00 (same time it already has)
    // must NOT conflict with itself.
    await expect(
      db.transaction(async (tx) => {
        await assertNoTimeConflict(tx, {
          jobApplicationId: applicationId,
          scheduledAt: new Date('2027-01-15T10:00:00.000Z'),
          durationMinutes: 60,
          ignoreInterviewId: existingInterviewId,
        });
      }),
    ).resolves.toBeUndefined();
  });

  it('defaults to 60min duration when durationMinutes is null', async () => {
    // Proposed 10:30 with null duration → treated as 60min → conflicts with 10:00-11:00.
    await expect(
      db.transaction(async (tx) => {
        await assertNoTimeConflict(tx, {
          jobApplicationId: applicationId,
          scheduledAt: new Date('2027-01-15T10:30:00.000Z'),
          durationMinutes: null,
        });
      }),
    ).rejects.toThrow();
  });
});
