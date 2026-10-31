import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db/client';
import { auditEvents } from '@/lib/db/schema/audit_events';
import { offers } from '@/lib/db/schema/interviews_offers';
import { candidateProfiles, persons } from '@/lib/db/schema/persons';
import {
  candidateMatches,
  employers,
  jobApplications,
  jobRequisitions,
  placements,
  shortlistEntries,
} from '@/lib/db/schema/recruitment';
import type { UserRole } from '@/lib/db/schema/users';
import { cleanupDb, e2eAdminId } from '@/test/db-fixtures';

/**
 * P0 placements workstream (W2), against the real dev DB with mocked
 * sessions whose grants come from the real role presets (pattern of
 * hr/privacy.test.ts). Every row carries STAMP and is removed in afterAll.
 *
 *  3. salary / currency / start date are copied from the accepted offer
 *     onto the placement; the audited exception may type them.
 *  4. job-status guard on every add / move / place path.
 *  5. ACCEPTED via updateApplicationStatus goes through the guarded
 *     placement path (placements.create, accepted offer or exception).
 *  6. manual add returns the real outcome.
 */

const session = {
  user: {
    id: '',
    email: 'p0-place@example.test',
    name: 'P0 Place',
    role: 'ADMIN' as UserRole,
    isOwner: false,
    personId: null,
    employerId: null,
  },
};
/** When set, replaces the role preset (to model a custom grant set). */
let customGrants: Set<string> | null = null;

vi.mock('@/lib/auth/session', async () => {
  const { AuthorizationError: AuthErr } = await import('@/lib/errors');
  const { presetForRole, hasPermission, encodeKey } = await import('@/lib/auth/permissions');
  const granted = () =>
    customGrants ??
    new Set(
      presetForRole(session.user.role as Parameters<typeof presetForRole>[0]).map((k) =>
        encodeKey(k.business, k.module, k.verb),
      ),
    );
  return {
    requireSession: vi.fn(async () => session),
    getSession: vi.fn(async () => session),
    requireInternalStaff: vi.fn(async () => session),
    requireRole: vi.fn(async () => session),
    loadCurrentUserPermissions: vi.fn(async () => null),
    requirePermission: vi.fn(async (b: string, m: string, v: string) => {
      if (!session.user.isOwner && !hasPermission(granted(), b as 'main', m, v as 'view')) {
        throw new AuthErr();
      }
      return session;
    }),
  };
});

const pm = await import('./service');
const apps = await import('@/modules/applications/service');
const ms = await import('@/modules/matching/service');
const { encodeKey } = await import('@/lib/auth/permissions');

const STAMP = `VITEST_P0PLACE_${Date.now()}`;
const EXCEPTION = { confirmed: true, reason: 'Hired via external recruitment partner' } as const;
const jobIds: string[] = [];
const personIds: string[] = [];
let employerId = '';
let adminId = '';

type JobStatus =
  | 'DRAFT'
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CLOSED'
  | 'CANCELLED';

async function seedJob(status: JobStatus, positions = 2, archived = false) {
  const [r] = await db
    .insert(jobRequisitions)
    .values({
      assignedUserId: adminId,
      employerId,
      title: `${STAMP} ${status} ${Math.random().toString(36).slice(2, 6)}`,
      positionsRequired: positions,
      employmentType: 'FULL_TIME',
      status,
      archivedAt: archived ? new Date() : null,
    })
    .returning({ id: jobRequisitions.id });
  if (!r) throw new Error('seed failed');
  jobIds.push(r.id);
  return r.id;
}

async function seedPerson(
  first: string,
  availability?: 'AVAILABLE' | 'PLACED' | 'TEMPORARILY_UNAVAILABLE',
) {
  const [p] = await db
    .insert(persons)
    .values({ firstName: first, lastName: STAMP, source: 'DIRECT' })
    .returning({ id: persons.id });
  if (!p) throw new Error('seed failed');
  personIds.push(p.id);
  if (availability) {
    await db.insert(candidateProfiles).values({ personId: p.id, availabilityStatus: availability });
  }
  return p.id;
}

async function seedApp(jobId: string, personId: string, status: string) {
  const [a] = await db
    .insert(jobApplications)
    .values({ personId, jobRequisitionId: jobId, source: 'INTERNAL', status: status as 'OFFER' })
    .returning({ id: jobApplications.id });
  if (!a) throw new Error('seed failed');
  return a.id;
}

async function acceptOffer(
  appId: string,
  amount = '34000',
  startDate: string | null = '2026-12-01',
) {
  const [o] = await db
    .insert(offers)
    .values({
      jobApplicationId: appId,
      amount,
      currencyCode: 'EUR',
      period: 'ANNUAL',
      startDate,
      status: 'ACCEPTED',
      sentAt: new Date('2026-10-20T10:00:00Z'),
      respondedAt: new Date('2026-10-22T10:00:00Z'),
      createdByUserId: adminId,
    })
    .returning({ id: offers.id });
  if (!o) throw new Error('seed failed');
  return o.id;
}

const placementsOn = (jobId: string) =>
  db.select().from(placements).where(eq(placements.jobRequisitionId, jobId));

function as(role: UserRole, grants: string[] | null = null) {
  session.user.role = role;
  customGrants = grants ? new Set(grants) : null;
}

beforeAll(async () => {
  adminId = await e2eAdminId();
  session.user.id = adminId;
  const [emp] = await db
    .insert(employers)
    .values({ assignedUserId: adminId, legalName: `${STAMP} Returning Client Ltd` })
    .returning({ id: employers.id });
  if (!emp) throw new Error('seed failed');
  employerId = emp.id;
});

afterAll(async () => {
  as('ADMIN');
  const profiles = personIds.length
    ? await db
        .select({ id: candidateProfiles.id })
        .from(candidateProfiles)
        .where(inArray(candidateProfiles.personId, personIds))
    : [];
  if (profiles.length) {
    await db.delete(auditEvents).where(
      inArray(
        auditEvents.entityId,
        profiles.map((p) => p.id),
      ),
    );
  }
  // Matching runs in other test files (running in parallel) can match
  // these people on their own jobs. Archive ours first so new runs skip
  // them, then remove any such rows (they reference our people) and retry
  // once if a run slipped in between.
  if (personIds.length) {
    await db.update(persons).set({ archivedAt: new Date() }).where(inArray(persons.id, personIds));
  }
  const dropForeignMatches = async () => {
    if (!personIds.length) return;
    const m = await db
      .select({ id: candidateMatches.id })
      .from(candidateMatches)
      .where(inArray(candidateMatches.personId, personIds));
    const sl = await db
      .select({ id: shortlistEntries.id })
      .from(shortlistEntries)
      .where(inArray(shortlistEntries.personId, personIds));
    const ids = [...m.map((r) => r.id), ...sl.map((r) => r.id)];
    if (ids.length) await db.delete(auditEvents).where(inArray(auditEvents.entityId, ids));
    await db.delete(shortlistEntries).where(inArray(shortlistEntries.personId, personIds));
    await db.delete(candidateMatches).where(inArray(candidateMatches.personId, personIds));
  };
  for (let attempt = 0; ; attempt++) {
    await dropForeignMatches();
    try {
      await cleanupDb(jobIds, personIds, [employerId]);
      break;
    } catch (e) {
      if (attempt >= 2) throw e;
    }
  }
});

describe('3 — placement terms come from the accepted offer', () => {
  it('copies €34,000 / annual and the 1 Dec 2026 start onto the placement (audited)', async () => {
    as('RECRUITER');
    const job = await seedJob('OPEN');
    const maria = await seedPerson('Maria', 'AVAILABLE');
    const app = await seedApp(job, maria, 'OFFER');
    const offerId = await acceptOffer(app);

    const placed = await pm.markApplicationPlaced(app);
    expect(placed.status).toBe('CONFIRMED');
    expect(placed.salary).toBe('34000.00');
    expect(placed.salaryCurrencyCode).toBe('EUR');
    expect(placed.startDate).toBe('2026-12-01');
    expect(placed.offerDate).toBe('2026-10-20');

    const [audit] = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.entityId, placed.id), eq(auditEvents.action, 'CREATED')));
    expect(audit?.context).toMatchObject({
      basis: 'accepted_offer',
      offerId,
      termsSource: 'accepted_offer',
      salaryPeriod: 'ANNUAL',
    });

    const rows = await pm.listPlacementsForRequisition(job);
    expect(rows[0]).toMatchObject({
      salary: '34000.00',
      salaryPeriod: 'ANNUAL',
      hasLiveInvoice: false,
    });
    const list = await pm.fetchPlacements();
    expect(list.find((r) => r.id === placed.id)?.startDate).toBe('2026-12-01');
  });

  it('the audited no-offer exception still works, with optional typed terms', async () => {
    as('RECRUITER');
    const job = await seedJob('OPEN');
    const a = await seedApp(job, await seedPerson('Ext'), 'OFFER');
    const b = await seedApp(job, await seedPerson('Bare'), 'OFFER');

    // Bad terms are refused before anything is written.
    await expect(
      pm.markApplicationPlaced(a, EXCEPTION, { salary: 'lots', startDate: '' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(await placementsOn(job)).toHaveLength(0);

    const withTerms = await pm.markApplicationPlaced(a, EXCEPTION, {
      salary: '30000',
      salaryCurrencyCode: 'EUR',
      startDate: '2027-01-04',
    });
    expect(withTerms).toMatchObject({
      salary: '30000.00',
      salaryCurrencyCode: 'EUR',
      startDate: '2027-01-04',
    });
    const exceptionAudit = await db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.entityId, withTerms.id),
          eq(auditEvents.action, 'PLACED_WITHOUT_ACCEPTED_OFFER'),
        ),
      );
    expect(exceptionAudit).toHaveLength(1);

    // Terms stay optional on the exception path.
    const bare = await pm.markApplicationPlaced(b, EXCEPTION);
    expect(bare.salary).toBeNull();
    expect(bare.startDate).toBeNull();
  });
});

describe('4 — job-status guard on add / move / place', () => {
  it('DRAFT: refuses adding and moving candidates with the open-job message', async () => {
    as('RECRUITER');
    const job = await seedJob('DRAFT');
    const p = await seedPerson('Drafty', 'AVAILABLE');
    const draftMsg = {
      code: 'REQUISITION_NOT_ACTIVE',
      message: 'Open this job before adding or moving candidates.',
    };
    await expect(
      apps.createApplication({ jobRequisitionId: job, personId: p }),
    ).rejects.toMatchObject(draftMsg);
    await expect(ms.manuallyShortlistPerson(p, job)).rejects.toMatchObject(draftMsg);

    const app = await seedApp(job, await seedPerson('Legacy'), 'APPLIED');
    await expect(
      apps.updateApplicationStatus({ applicationId: app, status: 'INTERVIEW' }),
    ).rejects.toMatchObject(draftMsg);
    // Close-out is still possible.
    const rejected = await apps.updateApplicationStatus({
      applicationId: app,
      status: 'REJECTED',
      rejectionReason: 'Role on hold',
    });
    expect(rejected.status).toBe('REJECTED');

    const offerApp = await seedApp(job, await seedPerson('Offered'), 'OFFER');
    await acceptOffer(offerApp);
    await expect(pm.markApplicationPlaced(offerApp)).rejects.toMatchObject({
      code: 'REQUISITION_NOT_ACTIVE',
      message: 'Open this job before placing candidates.',
    });
    await expect(
      pm.createPlacement({
        personId: p,
        employerId,
        jobRequisitionId: job,
        status: 'CONFIRMED',
        offerException: EXCEPTION,
      }),
    ).rejects.toMatchObject({ code: 'REQUISITION_NOT_ACTIVE' });
    expect(await placementsOn(job)).toHaveLength(0);
  });

  it('DRAFT: shortlisting a suggested match is refused too', async () => {
    as('RECRUITER');
    const job = await seedJob('DRAFT');
    const p = await seedPerson('Suggested', 'AVAILABLE');
    const [m] = await db
      .insert(candidateMatches)
      .values({
        jobRequisitionId: job,
        personId: p,
        score: 60,
        scoreBucket: 'MEDIUM',
        source: 'ASSISTED',
        status: 'SUGGESTED',
        reasons: [],
      })
      .returning({ id: candidateMatches.id });
    await expect(ms.shortlistMatch(m?.id ?? '')).rejects.toMatchObject({
      code: 'REQUISITION_NOT_ACTIVE',
    });
  });

  it('CLOSED / CANCELLED / FILLED / archived jobs refuse adds; placing keeps clear messages', async () => {
    as('RECRUITER');
    for (const [status, archived, expected] of [
      ['CLOSED', false, /closed/],
      ['CANCELLED', false, /cancelled/],
      ['FILLED', false, /filled/],
      ['OPEN', true, /archived/],
    ] as const) {
      const job = await seedJob(status, 1, archived);
      const p = await seedPerson(`Late${status}`, 'AVAILABLE');
      await expect(
        apps.createApplication({ jobRequisitionId: job, personId: p }),
      ).rejects.toMatchObject({
        code: 'REQUISITION_NOT_ACTIVE',
        message: expect.stringMatching(expected),
      });
      await expect(ms.manuallyShortlistPerson(p, job)).rejects.toMatchObject({
        code: 'REQUISITION_NOT_ACTIVE',
      });
    }

    const closed = await seedJob('CLOSED');
    const closedApp = await seedApp(closed, await seedPerson('Closer'), 'OFFER');
    await acceptOffer(closedApp);
    await expect(pm.markApplicationPlaced(closedApp)).rejects.toMatchObject({
      code: 'REQUISITION_NOT_ACTIVE',
      message: expect.stringMatching(/closed/),
    });
    // Rejecting the remaining candidate on a closed job is still allowed.
    const tidy = await apps.updateApplicationStatus({
      applicationId: closedApp,
      status: 'REJECTED',
    });
    expect(tidy.status).toBe('REJECTED');

    // FILLED: placing one more is the seat guard's refusal, naming capacity.
    const full = await seedJob('OPEN', 1);
    await pm.markApplicationPlaced(
      await seedApp(full, await seedPerson('Seat1'), 'OFFER'),
      EXCEPTION,
    );
    const [after] = await db.select().from(jobRequisitions).where(eq(jobRequisitions.id, full));
    expect(after?.status).toBe('FILLED');
    const extra = await seedApp(full, await seedPerson('Seat2'), 'OFFER');
    await expect(pm.markApplicationPlaced(extra, EXCEPTION)).rejects.toMatchObject({
      code: 'REQUISITION_OVERFILLED',
      message: expect.stringMatching(/already filled/),
    });
  });

  it('OPEN / IN_PROGRESS / PARTIALLY_FILLED keep manual assignment and the exception working', async () => {
    as('RECRUITER');
    for (const status of ['OPEN', 'IN_PROGRESS', 'PARTIALLY_FILLED'] as const) {
      const job = await seedJob(status, 3);
      const p = await seedPerson(`Live${status}`, 'AVAILABLE');
      const r = await ms.manuallyShortlistPerson(p, job);
      expect(r.outcome).toBe('added');
      const app = await apps.createApplication({ jobRequisitionId: job, personId: p });
      await apps.updateApplicationStatus({ applicationId: app.id, status: 'INTERVIEW' });
      await apps.updateApplicationStatus({ applicationId: app.id, status: 'OFFER' });
      const placed = await pm.markApplicationPlaced(app.id, EXCEPTION);
      expect(placed.status).toBe('CONFIRMED');
    }
  });
});

describe('5 — ACCEPTED through updateApplicationStatus uses the guarded placement path', () => {
  it('with an accepted offer: one CONFIRMED placement carrying the offer terms', async () => {
    as('RECRUITER');
    const job = await seedJob('OPEN');
    const app = await seedApp(job, await seedPerson('Panel', 'AVAILABLE'), 'OFFER');
    await acceptOffer(app, '36000', '2027-02-01');
    const accepted = await apps.updateApplicationStatus({ applicationId: app, status: 'ACCEPTED' });
    expect(accepted.status).toBe('ACCEPTED');
    // Repeating is a no-op, not a second placement.
    await apps.updateApplicationStatus({ applicationId: app, status: 'ACCEPTED' });
    const rows = await placementsOn(job);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: 'CONFIRMED',
      salary: '36000.00',
      startDate: '2027-02-01',
    });
  });

  it('without an accepted offer: refused with PLACEMENT_OFFER_REQUIRED, nothing created', async () => {
    as('RECRUITER');
    const job = await seedJob('OPEN');
    const app = await seedApp(job, await seedPerson('NoOffer'), 'OFFER');
    await expect(
      apps.updateApplicationStatus({ applicationId: app, status: 'ACCEPTED' }),
    ).rejects.toMatchObject({ code: 'PLACEMENT_OFFER_REQUIRED' });
    expect(await placementsOn(job)).toHaveLength(0);
    const [row] = await db.select().from(jobApplications).where(eq(jobApplications.id, app));
    expect(row?.status).toBe('OFFER');
  });

  it('requisitions.edit alone can no longer create a placement', async () => {
    const job = await seedJob('OPEN');
    const app = await seedApp(job, await seedPerson('Weak'), 'OFFER');
    await acceptOffer(app);
    as('RECRUITER', [
      encodeKey('recruitment', 'requisitions', 'view'),
      encodeKey('recruitment', 'requisitions', 'edit'),
    ]);
    await expect(
      apps.updateApplicationStatus({ applicationId: app, status: 'ACCEPTED' }),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_ERROR' });
    as('ADMIN');
    expect(await placementsOn(job)).toHaveLength(0);
  });
});

describe('6 — "Add candidate" reports what really happened', () => {
  const shortlistAudits = async (jobId: string, personId: string) => {
    const [m] = await db
      .select({ id: candidateMatches.id })
      .from(candidateMatches)
      .where(
        and(eq(candidateMatches.jobRequisitionId, jobId), eq(candidateMatches.personId, personId)),
      );
    return db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.entityId, m?.id ?? ''), eq(auditEvents.action, 'SHORTLISTED')));
  };

  it('added, then already Shortlisted (no-op, no duplicate audit), then already at Applied', async () => {
    as('RECRUITER');
    const job = await seedJob('OPEN');
    const maria = await seedPerson('Maria', 'AVAILABLE');
    expect((await ms.manuallyShortlistPerson(maria, job)).outcome).toBe('added');
    expect(await ms.manuallyShortlistPerson(maria, job)).toMatchObject({
      outcome: 'already_at_stage',
      stage: 'Shortlisted',
    });
    expect(await shortlistAudits(job, maria)).toHaveLength(1);

    await apps.createApplication({ jobRequisitionId: job, personId: maria });
    expect(await ms.manuallyShortlistPerson(maria, job)).toMatchObject({
      outcome: 'already_at_stage',
      stage: 'Applied',
    });
  });

  it('a rejected application is refused with the reason; a dismissed match is reactivated', async () => {
    as('RECRUITER');
    const job = await seedJob('OPEN');
    const rejected = await seedPerson('Rejected', 'AVAILABLE');
    await db.insert(jobApplications).values({
      personId: rejected,
      jobRequisitionId: job,
      source: 'INTERNAL',
      status: 'REJECTED',
    });
    const r = await ms.manuallyShortlistPerson(rejected, job);
    expect(r).toMatchObject({ outcome: 'refused', code: 'APPLICATION_CLOSED' });
    expect(r.outcome === 'refused' && r.reason).toMatch(/rejected/);

    const dismissed = await seedPerson('Dismissed', 'AVAILABLE');
    await db.insert(candidateMatches).values({
      jobRequisitionId: job,
      personId: dismissed,
      score: 40,
      scoreBucket: 'LOW',
      source: 'ASSISTED',
      status: 'DISMISSED',
      reasons: [],
    });
    expect(await ms.manuallyShortlistPerson(dismissed, job)).toMatchObject({
      outcome: 'reactivated',
      previousStatus: 'DISMISSED',
    });
    const [entry] = await db
      .select()
      .from(shortlistEntries)
      .where(
        and(eq(shortlistEntries.jobRequisitionId, job), eq(shortlistEntries.personId, dismissed)),
      );
    expect(entry).toBeDefined();
  });

  it('a placed candidate needs an explicit, audited confirmation', async () => {
    as('RECRUITER');
    const job = await seedJob('OPEN');
    const placed = await seedPerson('Placed', 'PLACED');
    const first = await ms.manuallyShortlistPerson(placed, job);
    expect(first).toMatchObject({ outcome: 'refused', code: 'AVAILABILITY_CONFIRMATION_REQUIRED' });
    expect(
      await db
        .select()
        .from(shortlistEntries)
        .where(
          and(eq(shortlistEntries.jobRequisitionId, job), eq(shortlistEntries.personId, placed)),
        ),
    ).toHaveLength(0);

    const second = await ms.manuallyShortlistPerson(placed, job, { confirmAvailability: true });
    expect(second.outcome).toBe('added');
    const [audit] = await shortlistAudits(job, placed);
    expect(audit?.context).toMatchObject({
      via: 'manual_add',
      overrideAvailability: true,
      availabilityStatus: 'PLACED',
    });
  });
});

describe('placement fee raisable rule', () => {
  it('only confirmed / started / completed placements without a live invoice', async () => {
    const { isPlacementFeeRaisable } = await import('./fee');
    expect(isPlacementFeeRaisable({ status: 'CONFIRMED', hasLiveInvoice: false })).toBe(true);
    expect(isPlacementFeeRaisable({ status: 'COMPLETED', hasLiveInvoice: false })).toBe(true);
    expect(isPlacementFeeRaisable({ status: 'CONFIRMED', hasLiveInvoice: true })).toBe(false);
    expect(isPlacementFeeRaisable({ status: 'PROPOSED', hasLiveInvoice: false })).toBe(false);
    expect(isPlacementFeeRaisable({ status: 'TERMINATED_EARLY', hasLiveInvoice: false })).toBe(
      false,
    );
    expect(
      isPlacementFeeRaisable({ status: 'STARTED', hasLiveInvoice: false, archivedAt: new Date() }),
    ).toBe(false);
  });
});
