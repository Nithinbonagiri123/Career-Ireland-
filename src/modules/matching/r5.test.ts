import { and, desc, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db/client';
import { auditEvents } from '@/lib/db/schema/audit_events';
import { candidateSkills } from '@/lib/db/schema/candidate_details';
import { candidateProfiles, persons } from '@/lib/db/schema/persons';
import {
  candidateMatches,
  employers,
  jobRequisitions,
  placements,
  requisitionSkills,
  shortlistEntries,
} from '@/lib/db/schema/recruitment';
import { skills } from '@/lib/db/schema/reference';
import { type UserRole, users } from '@/lib/db/schema/users';
import { e2eAdminId } from '@/test/db-fixtures';

/**
 * R5 — matching & shortlists against the real DB, permissions from the
 * real role presets (RECRUITER has recruitment.matching view/create/edit;
 * STAFF and FINANCE have none).
 */

const session = {
  user: {
    id: '',
    email: 'r5@example.test',
    name: 'R5 Tester',
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

// Lets one test make the removal's audit write fail, to prove atomicity.
const auditFault = { failAction: null as string | null };
vi.mock('@/lib/audit/withAudit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/audit/withAudit')>();
  return {
    ...actual,
    recordAudit: vi.fn(
      async (
        tx: Parameters<typeof actual.recordAudit>[0],
        ctx: Parameters<typeof actual.recordAudit>[1],
      ) => {
        if (auditFault.failAction && ctx.action === auditFault.failAction) {
          throw new Error('simulated audit failure');
        }
        return actual.recordAudit(tx, ctx);
      },
    ),
  };
});

const ms = await import('./service');
const ws = await import('./workspace');

const STAMP = `vitest-r5-${Date.now()}`;
const ids = {
  user: '',
  employer: '',
  job: '',
  closedJob: '',
  skill: '',
  persons: [] as string[],
};

async function seedCandidate(
  tag: string,
  opts: { availability?: 'AVAILABLE' | 'TEMPORARILY_UNAVAILABLE' | 'PLACED'; skill?: boolean } = {},
) {
  const [p] = await db
    .insert(persons)
    .values({ firstName: `R5${tag}`, lastName: STAMP, source: 'DIRECT' })
    .returning({ id: persons.id });
  if (!p) throw new Error('seed failed');
  ids.persons.push(p.id);
  await db.insert(candidateProfiles).values({
    assignedUserId: await e2eAdminId(),
    personId: p.id,
    lifecycleStatus: 'ACTIVE',
    availabilityStatus: opts.availability ?? 'AVAILABLE',
  });
  if (opts.skill) await db.insert(candidateSkills).values({ personId: p.id, skillId: ids.skill });
  return p.id;
}

const matchFor = async (jobId: string, personId: string) =>
  (
    await db
      .select()
      .from(candidateMatches)
      .where(
        and(eq(candidateMatches.jobRequisitionId, jobId), eq(candidateMatches.personId, personId)),
      )
  )[0];

beforeAll(async () => {
  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'e2e-admin@ireland-careers.test'))
    .limit(1);
  if (!admin) throw new Error('e2e admin seed missing');
  ids.user = admin.id;
  session.user.id = admin.id;
  const [emp] = await db
    .insert(employers)
    .values({ assignedUserId: await e2eAdminId(), legalName: `${STAMP} Care` })
    .returning();
  ids.employer = emp?.id ?? '';
  const jobs = await db
    .insert(jobRequisitions)
    .values([
      {
        assignedUserId: await e2eAdminId(),
        employerId: ids.employer,
        title: `${STAMP} HCA`,
        positionsRequired: 2,
        employmentType: 'FULL_TIME',
        status: 'OPEN',
      },
      {
        assignedUserId: await e2eAdminId(),
        employerId: ids.employer,
        title: `${STAMP} closed`,
        positionsRequired: 1,
        employmentType: 'FULL_TIME',
        status: 'CLOSED',
      },
    ])
    .returning({ id: jobRequisitions.id });
  ids.job = jobs[0]?.id ?? '';
  ids.closedJob = jobs[1]?.id ?? '';
  const [sk] = await db
    .insert(skills)
    .values({ name: `${STAMP} manual handling` })
    .returning();
  ids.skill = sk?.id ?? '';
  await db
    .insert(requisitionSkills)
    .values({ jobRequisitionId: ids.job, skillId: ids.skill, isRequired: true });
});

beforeEach(() => {
  session.user.role = 'RECRUITER';
  auditFault.failAction = null;
});

afterAll(async () => {
  const jobIds = [ids.job, ids.closedJob];
  const entries = await db
    .select({ id: shortlistEntries.id })
    .from(shortlistEntries)
    .where(inArray(shortlistEntries.jobRequisitionId, jobIds));
  const matches = await db
    .select({ id: candidateMatches.id })
    .from(candidateMatches)
    .where(inArray(candidateMatches.jobRequisitionId, jobIds));
  await db
    .delete(auditEvents)
    .where(
      inArray(auditEvents.entityId, [
        ...jobIds,
        ...entries.map((e) => e.id),
        ...matches.map((m) => m.id),
      ]),
    );
  await db.execute(
    // Removal snapshots of this test's jobs (their rows are gone).
    (await import('drizzle-orm'))
      .sql`DELETE FROM audit_events WHERE entity_type = 'shortlist_entry' AND (before->>'jobRequisitionId' IN (${ids.job}, ${ids.closedJob}) OR after->>'jobRequisitionId' IN (${ids.job}, ${ids.closedJob}))`,
  );
  await db.delete(shortlistEntries).where(inArray(shortlistEntries.jobRequisitionId, jobIds));
  await db.delete(candidateMatches).where(inArray(candidateMatches.jobRequisitionId, jobIds));
  await db.delete(placements).where(inArray(placements.jobRequisitionId, jobIds));
  await db.delete(requisitionSkills).where(eq(requisitionSkills.jobRequisitionId, ids.job));
  if (ids.persons.length) {
    await db.delete(candidateSkills).where(inArray(candidateSkills.personId, ids.persons));
    await db.delete(candidateProfiles).where(inArray(candidateProfiles.personId, ids.persons));
    await db.delete(persons).where(inArray(persons.id, ids.persons));
  }
  await db.delete(skills).where(eq(skills.id, ids.skill));
  await db.delete(jobRequisitions).where(inArray(jobRequisitions.id, jobIds));
  await db.delete(employers).where(eq(employers.id, ids.employer));
});

describe('matching run', () => {
  it('scores by the job’s requirements: the candidate with the required skill ranks higher', async () => {
    const withSkill = await seedCandidate('skilled', { skill: true });
    const without = await seedCandidate('plain');
    await ms.runAssistedMatching({ requisitionId: ids.job, minScore: 0 });
    const a = await matchFor(ids.job, withSkill);
    const b = await matchFor(ids.job, without);
    expect(a?.score).toBeGreaterThan(b?.score ?? 0);
    expect(a?.reasons.some((r) => r.matched && /skill/i.test(r.label))).toBe(true);
    expect(a?.source).toBe('ASSISTED');
  });

  it('leaves out confirmed-placed and explicitly unavailable candidates by default', async () => {
    const unavailable = await seedCandidate('away', {
      availability: 'TEMPORARILY_UNAVAILABLE',
      skill: true,
    });
    const placedFlag = await seedCandidate('placedflag', { availability: 'PLACED', skill: true });
    const placedLive = await seedCandidate('placedlive', { skill: true });
    await db.insert(placements).values({
      personId: placedLive,
      employerId: ids.employer,
      jobRequisitionId: ids.closedJob,
      status: 'CONFIRMED',
    });
    const r = await ms.runAssistedMatching({ requisitionId: ids.job, minScore: 0 });
    expect(r.excluded).toBeGreaterThanOrEqual(3);
    for (const p of [unavailable, placedFlag, placedLive]) {
      expect(await matchFor(ids.job, p)).toBeUndefined();
    }
    // Explicit opt-in includes them.
    await ms.runAssistedMatching({ requisitionId: ids.job, includeUnavailable: true, minScore: 0 });
    expect(await matchFor(ids.job, unavailable)).toBeDefined();
  });

  it('reruns preserve manual origin and status; repeat runs are idempotent', async () => {
    const manual = await seedCandidate('manual', { skill: true });
    await ms.manuallyShortlistPerson(manual, ids.job);
    const before = await matchFor(ids.job, manual);
    expect(before?.source).toBe('MANUAL');
    await ms.runAssistedMatching({ requisitionId: ids.job, minScore: 0 });
    const after = await matchFor(ids.job, manual);
    expect(after?.source).toBe('MANUAL');
    expect(after?.status).toBe('SHORTLISTED');
    expect(after?.score).toBeGreaterThan(0); // score refreshed
    // Only this file's candidates: other test files may add people meanwhile.
    const countRows = async () =>
      (
        await db
          .select()
          .from(candidateMatches)
          .where(
            and(
              eq(candidateMatches.jobRequisitionId, ids.job),
              inArray(candidateMatches.personId, ids.persons),
            ),
          )
      ).length;
    const n1 = await countRows();
    await ms.runAssistedMatching({ requisitionId: ids.job, minScore: 0 });
    expect(await countRows()).toBe(n1);
  });

  it('concurrent runs on the same job both succeed and leave one row per candidate', async () => {
    const p = await seedCandidate('concurrent', { skill: true });
    const results = await Promise.all([
      ms.runAssistedMatching({ requisitionId: ids.job, minScore: 0 }),
      ms.runAssistedMatching({ requisitionId: ids.job, minScore: 0 }),
      ms.runAssistedMatching({ requisitionId: ids.job, minScore: 0 }),
    ]);
    // Every run succeeds (no unique-key collision). Counts may differ if
    // other test files add candidates meanwhile, so only the guarantee is asserted.
    expect(results.every((r) => r.upserted >= 1)).toBe(true);
    const rows = await db
      .select()
      .from(candidateMatches)
      .where(and(eq(candidateMatches.jobRequisitionId, ids.job), eq(candidateMatches.personId, p)));
    expect(rows).toHaveLength(1);
  });

  it('closed jobs refuse matching and new shortlisting; history stays', async () => {
    const p = await seedCandidate('closed', { skill: true });
    await expect(ms.runAssistedMatching({ requisitionId: ids.closedJob })).rejects.toMatchObject({
      code: 'REQUISITION_NOT_ACTIVE',
    });
    await expect(ms.manuallyShortlistPerson(p, ids.closedJob)).rejects.toMatchObject({
      code: 'REQUISITION_NOT_ACTIVE',
    });
    // An existing match on a job that later closes cannot be shortlisted.
    const [m] = await db
      .insert(candidateMatches)
      .values({ jobRequisitionId: ids.closedJob, personId: p, score: 50, scoreBucket: 'MEDIUM' })
      .returning({ id: candidateMatches.id });
    await expect(ms.shortlistMatch(m?.id ?? '')).rejects.toMatchObject({
      code: 'REQUISITION_NOT_ACTIVE',
    });
    expect(await matchFor(ids.closedJob, p)).toBeDefined();
  });
});

describe('shortlist actions', () => {
  it('shortlisting a match is idempotent under concurrent clicks', async () => {
    const p = await seedCandidate('double', { skill: true });
    await ms.runAssistedMatching({ requisitionId: ids.job, minScore: 0 });
    const m = await matchFor(ids.job, p);
    await Promise.all([ms.shortlistMatch(m?.id ?? ''), ms.shortlistMatch(m?.id ?? '')]);
    const rows = await db
      .select()
      .from(shortlistEntries)
      .where(and(eq(shortlistEntries.jobRequisitionId, ids.job), eq(shortlistEntries.personId, p)));
    expect(rows).toHaveLength(1);
    // A shortlisted match cannot simply be dismissed.
    await expect(ms.dismissMatch(m?.id ?? '')).rejects.toMatchObject({ code: 'MATCH_SHORTLISTED' });
  });

  it('presentation + employer feedback: validated and audited', async () => {
    const p = await seedCandidate('present');
    await ms.manuallyShortlistPerson(p, ids.job);
    const [entry] = await db
      .select()
      .from(shortlistEntries)
      .where(and(eq(shortlistEntries.jobRequisitionId, ids.job), eq(shortlistEntries.personId, p)));
    const id = entry?.id ?? '';
    await expect(
      ms.recordEmployerFeedback({ shortlistEntryId: id, feedback: 'Strong CV' }),
    ).rejects.toMatchObject({
      code: 'SHORTLIST_NOT_PRESENTED',
    });
    await expect(
      ms.recordPresentedToEmployer({ shortlistEntryId: id, presentedOn: '2099-01-01' }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    const presented = await ms.recordPresentedToEmployer({
      shortlistEntryId: id,
      presentedOn: '2026-10-20',
    });
    expect(presented.presentedToEmployerAt?.toISOString()).toBe('2026-10-20T11:00:00.000Z'); // 12:00 IST
    const fb = await ms.recordEmployerFeedback({
      shortlistEntryId: id,
      feedback: 'Invite to interview',
    });
    expect(fb.employerFeedback).toBe('Invite to interview');
    const actions = (await db.select().from(auditEvents).where(eq(auditEvents.entityId, id))).map(
      (a) => a.action,
    );
    expect(actions).toEqual(expect.arrayContaining(['PRESENTED_TO_EMPLOYER', 'EMPLOYER_FEEDBACK']));
  });

  it('removal needs a meaningful reason, returns the match to Reviewed and writes a full snapshot', async () => {
    const p = await seedCandidate('remove', { skill: true });
    await ms.runAssistedMatching({ requisitionId: ids.job, minScore: 0 });
    const m = await matchFor(ids.job, p);
    await ms.shortlistMatch(m?.id ?? '');
    const [entry] = await db
      .select()
      .from(shortlistEntries)
      .where(eq(shortlistEntries.candidateMatchId, m?.id ?? ''));
    const id = entry?.id ?? '';
    await ms.recordPresentedToEmployer({ shortlistEntryId: id, presentedOn: '2026-10-21' });
    await ms.recordEmployerFeedback({ shortlistEntryId: id, feedback: 'Not enough experience' });

    for (const reason of ['', 'no', '!!!!!!']) {
      await expect(ms.removeFromShortlist({ shortlistEntryId: id, reason })).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
      });
    }
    await ms.removeFromShortlist({
      shortlistEntryId: id,
      reason: 'Employer declined after review',
    });
    expect(
      await db.select().from(shortlistEntries).where(eq(shortlistEntries.id, id)),
    ).toHaveLength(0);
    expect((await matchFor(ids.job, p))?.status).toBe('REVIEWED');
    const [snap] = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.entityId, id), eq(auditEvents.action, 'REMOVED')));
    expect(snap?.actorUserId).toBe(ids.user);
    expect(snap?.before).toMatchObject({
      jobRequisitionId: ids.job,
      personId: p,
      personName: `R5remove ${STAMP}`,
      shortlistedAt: entry?.createdAt.toISOString(),
      presentedToEmployerAt: '2026-10-21T11:00:00.000Z',
      employerFeedback: 'Not enough experience',
    });
    expect(snap?.context).toMatchObject({
      reason: 'Employer declined after review',
      removedByUserId: ids.user,
    });
    // Shows up in the removal history.
    const history = await ws.fetchShortlistRemovals({ requisitionId: ids.job });
    expect(
      history.some((h) => h.id === snap?.id && h.reason === 'Employer declined after review'),
    ).toBe(true);
  });

  it('removal is atomic: if the audit write fails, the entry and match are untouched', async () => {
    const p = await seedCandidate('atomic');
    await ms.manuallyShortlistPerson(p, ids.job);
    const [entry] = await db
      .select()
      .from(shortlistEntries)
      .where(and(eq(shortlistEntries.jobRequisitionId, ids.job), eq(shortlistEntries.personId, p)));
    auditFault.failAction = 'REMOVED';
    await expect(
      ms.removeFromShortlist({
        shortlistEntryId: entry?.id ?? '',
        reason: 'Testing rollback path',
      }),
    ).rejects.toThrow('simulated audit failure');
    auditFault.failAction = null;
    expect(
      await db
        .select()
        .from(shortlistEntries)
        .where(eq(shortlistEntries.id, entry?.id ?? '')),
    ).toHaveLength(1);
    expect((await matchFor(ids.job, p))?.status).toBe('SHORTLISTED');
  });
});

describe('authorization', () => {
  it('STAFF and FINANCE cannot run matching or change shortlists, nor read the global workspaces', async () => {
    const p = await seedCandidate('auth');
    await ms.manuallyShortlistPerson(p, ids.job);
    const [entry] = await db
      .select()
      .from(shortlistEntries)
      .where(and(eq(shortlistEntries.jobRequisitionId, ids.job), eq(shortlistEntries.personId, p)));
    const m = await matchFor(ids.job, p);
    for (const role of ['STAFF', 'FINANCE'] as const) {
      session.user.role = role;
      const denied = { code: 'AUTHORIZATION_ERROR' };
      await expect(
        ms.runAssistedMatching({ requisitionId: ids.job, minScore: 0 }),
      ).rejects.toMatchObject(denied);
      await expect(ms.manuallyShortlistPerson(p, ids.job)).rejects.toMatchObject(denied);
      await expect(ms.shortlistMatch(m?.id ?? '')).rejects.toMatchObject(denied);
      await expect(ms.dismissMatch(m?.id ?? '')).rejects.toMatchObject(denied);
      await expect(
        ms.removeFromShortlist({ shortlistEntryId: entry?.id ?? '', reason: 'Should be refused' }),
      ).rejects.toMatchObject(denied);
      await expect(
        ms.recordPresentedToEmployer({
          shortlistEntryId: entry?.id ?? '',
          presentedOn: '2026-10-01',
        }),
      ).rejects.toMatchObject(denied);
      await expect(ws.fetchGlobalMatches()).rejects.toMatchObject(denied);
      await expect(ws.fetchGlobalShortlists()).rejects.toMatchObject(denied);
    }
    session.user.role = 'RECRUITER';
    const list = await ws.fetchGlobalShortlists({ requisitionId: ids.job });
    expect(list.rows.some((r) => r.personId === p)).toBe(true);
  });

  it('global matches hide unavailable candidates by default and say how many', async () => {
    const away = await seedCandidate('hidden', {
      availability: 'TEMPORARILY_UNAVAILABLE',
      skill: true,
    });
    await db
      .insert(candidateMatches)
      .values({ jobRequisitionId: ids.job, personId: away, score: 60, scoreBucket: 'MEDIUM' });
    const def = await ws.fetchGlobalMatches({ requisitionId: ids.job });
    expect(def.rows.some((r) => r.personId === away)).toBe(false);
    expect(def.hiddenUnavailable).toBeGreaterThanOrEqual(1);
    const all = await ws.fetchGlobalMatches({ requisitionId: ids.job, availability: 'all' });
    expect(all.rows.some((r) => r.personId === away)).toBe(true);
  });
});

describe('minimum score for new matches', () => {
  // Scores run 0–100. On this job a candidate with the required skill
  // scores 45 (available 15 + active 5 + skills 25); one without scores 20.
  it('defaults to 50: weak new candidates are not added, and the run reports them', async () => {
    const skilled = await seedCandidate('thrSkilled', { skill: true });
    const plain = await seedCandidate('thrPlain');
    const r = await ms.runAssistedMatching({ requisitionId: ids.job });
    expect(r.minScore).toBe(50);
    expect(r.belowThreshold).toBeGreaterThanOrEqual(2);
    expect(await matchFor(ids.job, skilled)).toBeUndefined();
    expect(await matchFor(ids.job, plain)).toBeUndefined();
    const [audit] = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.entityId, ids.job), eq(auditEvents.action, 'MATCHING_RUN')))
      .orderBy(desc(auditEvents.occurredAt))
      .limit(1);
    expect(audit?.context).toMatchObject({ minScore: 50 });
  });

  it('a lower minimum adds the candidates who reach it', async () => {
    const skilled = await seedCandidate('thr40Skilled', { skill: true });
    const plain = await seedCandidate('thr40Plain');
    await ms.runAssistedMatching({ requisitionId: ids.job, minScore: 40 });
    expect((await matchFor(ids.job, skilled))?.score).toBe(45);
    expect(await matchFor(ids.job, plain)).toBeUndefined();
  });

  it('existing weak and manual matches are kept and refreshed, never removed', async () => {
    const weak = await seedCandidate('thrWeak');
    const manual = await seedCandidate('thrManual');
    await ms.manuallyShortlistPerson(manual, ids.job);
    await ms.runAssistedMatching({ requisitionId: ids.job, minScore: 0 });
    const weakBefore = await matchFor(ids.job, weak);
    expect(weakBefore?.score).toBe(20);
    // Make the stored score stale so a refresh is observable.
    await db
      .update(candidateMatches)
      .set({ score: 1 })
      .where(eq(candidateMatches.id, weakBefore?.id ?? ''));
    const r = await ms.runAssistedMatching({ requisitionId: ids.job }); // default 50
    expect(r.refreshed).toBeGreaterThanOrEqual(2);
    const weakAfter = await matchFor(ids.job, weak);
    expect(weakAfter?.id).toBe(weakBefore?.id);
    expect(weakAfter?.score).toBe(20);
    const manualAfter = await matchFor(ids.job, manual);
    expect(manualAfter?.source).toBe('MANUAL');
    expect(manualAfter?.status).toBe('SHORTLISTED');
  });

  it('rejects a minimum outside 0–100 or not a whole number', async () => {
    for (const minScore of [-1, 101, 2.5, Number.NaN]) {
      await expect(
        ms.runAssistedMatching({ requisitionId: ids.job, minScore }),
      ).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        fields: { minScore: expect.any(String) },
      });
    }
  });
});
