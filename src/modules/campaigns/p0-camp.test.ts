import { and, eq, inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db/client';
import { tasks } from '@/lib/db/schema/activities';
import { auditEvents } from '@/lib/db/schema/audit_events';
import {
  advertisements,
  recruitmentCampaigns,
  recruitmentProspects,
} from '@/lib/db/schema/campaigns';
import { candidateProfiles, persons } from '@/lib/db/schema/persons';
import {
  candidateMatches,
  employers,
  jobRequisitions,
  shortlistEntries,
} from '@/lib/db/schema/recruitment';
import { type UserRole, users } from '@/lib/db/schema/users';
import { isJobAdvertisable, jobIneligibility } from './job-eligibility';

/**
 * P0 (owner decision 7) — campaign ↔ job integrity and the prospect P0
 * slice, against the real DB with a mocked RECRUITER session (permissions
 * from the real role presets).
 *  - Two kinds: talent pool (no job, no employer) and job campaigns whose
 *    employer is always the job's employer. A mismatched or job-less
 *    employerId is refused.
 *  - One "can be advertised" rule (open / in progress / partly filled, not
 *    archived) for the picker, save and activation (and resume).
 *  - Prospects only on live adverts; name-only matches are an overridable
 *    warning; closing a prospect cancels their follow-up.
 */

const session = {
  user: {
    id: '',
    email: 'p0-camp@example.test',
    name: 'P0 Camp Tester',
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

const cs = await import('./service');
const ps = await import('./prospects');

const STAMP = `vitest-p0camp-${Date.now()}`;
type JobKey =
  | 'open'
  | 'inProgress'
  | 'partly'
  | 'draft'
  | 'filled'
  | 'closed'
  | 'cancelled'
  | 'archived'
  | 'other';
const ids = {
  employer: '',
  otherEmployer: '',
  jobs: {} as Record<JobKey, string>,
  campaigns: [] as string[],
  persons: [] as string[],
};

async function seedPerson(tag: string, extra: Partial<typeof persons.$inferInsert> = {}) {
  const [p] = await db
    .insert(persons)
    .values({ firstName: `P0${tag}`, lastName: STAMP, source: 'DIRECT', ...extra })
    .returning({ id: persons.id });
  if (!p) throw new Error('seed failed');
  ids.persons.push(p.id);
  return p.id;
}

async function save(input: Parameters<typeof cs.saveCampaign>[0]) {
  const c = await cs.saveCampaign(input);
  if (!ids.campaigns.includes(c.id)) ids.campaigns.push(c.id);
  return c;
}

async function liveCampaignWithAd() {
  const c = await save({ name: `${STAMP} live`, jobRequisitionId: ids.jobs.open });
  await cs.transitionCampaign({ campaignId: c.id, to: 'ACTIVE' });
  const ad = await cs.upsertAdvertisement({
    campaignId: c.id,
    country: 'Ireland',
    platform: 'IrishJobs',
    targetApplicants: 5,
    startDate: '2026-11-01',
    expiryDate: '2026-12-01',
    status: 'ACTIVE',
  });
  return { campaignId: c.id, adId: ad.id };
}

const campaignCount = async () =>
  (
    await db
      .select({ id: recruitmentCampaigns.id })
      .from(recruitmentCampaigns)
      .where(like(recruitmentCampaigns.name, `${STAMP}%`))
  ).length;

beforeAll(async () => {
  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'e2e-admin@ireland-careers.test'))
    .limit(1);
  if (!admin) throw new Error('e2e admin seed missing');
  session.user.id = admin.id;
  const [emp, other] = await db
    .insert(employers)
    .values([
      { assignedUserId: admin.id, legalName: `${STAMP} Sunrise Care` },
      { assignedUserId: admin.id, legalName: `${STAMP} Bayview Nursing` },
    ])
    .returning({ id: employers.id });
  if (!emp || !other) throw new Error('seed failed');
  ids.employer = emp.id;
  ids.otherEmployer = other.id;
  const spec: Array<[JobKey, string, typeof jobRequisitions.$inferInsert.status, boolean]> = [
    ['open', emp.id, 'OPEN', false],
    ['inProgress', emp.id, 'IN_PROGRESS', false],
    ['partly', emp.id, 'PARTIALLY_FILLED', false],
    ['draft', emp.id, 'DRAFT', false],
    ['filled', emp.id, 'FILLED', false],
    ['closed', emp.id, 'CLOSED', false],
    ['cancelled', emp.id, 'CANCELLED', false],
    ['archived', emp.id, 'OPEN', true],
    ['other', other.id, 'OPEN', false],
  ];
  const rows = await db
    .insert(jobRequisitions)
    .values(
      spec.map(([key, employerId, status, archived]) => ({
        assignedUserId: admin.id,
        employerId,
        title: `${STAMP} ${key}`,
        positionsRequired: 2,
        employmentType: 'FULL_TIME' as const,
        status,
        archivedAt: archived ? new Date() : null,
      })),
    )
    .returning({ id: jobRequisitions.id, title: jobRequisitions.title });
  for (const [key] of spec) {
    const row = rows.find((r) => r.title === `${STAMP} ${key}`);
    if (!row) throw new Error('seed failed');
    ids.jobs[key] = row.id;
  }
});

beforeEach(() => {
  session.user.role = 'RECRUITER';
});

afterAll(async () => {
  const camps = (
    await db
      .select({ id: recruitmentCampaigns.id })
      .from(recruitmentCampaigns)
      .where(like(recruitmentCampaigns.name, `${STAMP}%`))
  ).map((c) => c.id);
  const adIds = camps.length
    ? (
        await db
          .select({ id: advertisements.id })
          .from(advertisements)
          .where(inArray(advertisements.campaignId, camps))
      ).map((a) => a.id)
    : [];
  const prospectIds = adIds.length
    ? (
        await db
          .select({ id: recruitmentProspects.id })
          .from(recruitmentProspects)
          .where(inArray(recruitmentProspects.advertisementId, adIds))
      ).map((p) => p.id)
    : [];
  const people = await db
    .select({ id: persons.id })
    .from(persons)
    .where(eq(persons.lastName, STAMP));
  const personIds = [...new Set([...ids.persons, ...people.map((p) => p.id)])];
  const taskIds = personIds.length
    ? (await db.select({ id: tasks.id }).from(tasks).where(inArray(tasks.personId, personIds))).map(
        (t) => t.id,
      )
    : [];
  const profileIds = personIds.length
    ? (
        await db
          .select({ id: candidateProfiles.id })
          .from(candidateProfiles)
          .where(inArray(candidateProfiles.personId, personIds))
      ).map((p) => p.id)
    : [];
  const jobIds = Object.values(ids.jobs);
  const entityIds = [
    ...camps,
    ...adIds,
    ...prospectIds,
    ...personIds,
    ...taskIds,
    ...profileIds,
    ...jobIds,
  ];
  if (entityIds.length)
    await db.delete(auditEvents).where(inArray(auditEvents.entityId, entityIds));
  if (taskIds.length) await db.delete(tasks).where(inArray(tasks.id, taskIds));
  if (adIds.length) {
    await db.delete(tasks).where(inArray(tasks.advertisementId, adIds));
    await db
      .delete(recruitmentProspects)
      .where(inArray(recruitmentProspects.advertisementId, adIds));
    await db.delete(advertisements).where(inArray(advertisements.id, adIds));
  }
  if (camps.length)
    await db.delete(recruitmentCampaigns).where(inArray(recruitmentCampaigns.id, camps));
  if (jobIds.length) {
    await db.delete(shortlistEntries).where(inArray(shortlistEntries.jobRequisitionId, jobIds));
    await db.delete(candidateMatches).where(inArray(candidateMatches.jobRequisitionId, jobIds));
  }
  if (personIds.length) {
    await db.delete(candidateProfiles).where(inArray(candidateProfiles.personId, personIds));
    for (let attempt = 0; attempt < 6; attempt++) {
      await db.delete(shortlistEntries).where(inArray(shortlistEntries.personId, personIds));
      await db.delete(candidateMatches).where(inArray(candidateMatches.personId, personIds));
      try {
        await db.delete(persons).where(inArray(persons.id, personIds));
        break;
      } catch (e) {
        if (attempt === 5) throw e;
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  }
  if (jobIds.length) await db.delete(jobRequisitions).where(inArray(jobRequisitions.id, jobIds));
  await db.delete(employers).where(inArray(employers.id, [ids.employer, ids.otherEmployer]));
});

describe('shared "can be advertised" rule', () => {
  it('allows open / in progress / partly filled; refuses draft, filled, closed, cancelled, archived', () => {
    for (const status of ['OPEN', 'IN_PROGRESS', 'PARTIALLY_FILLED']) {
      expect(isJobAdvertisable({ status })).toBe(true);
    }
    for (const status of ['DRAFT', 'FILLED', 'CLOSED', 'CANCELLED']) {
      expect(isJobAdvertisable({ status })).toBe(false);
    }
    expect(isJobAdvertisable({ status: 'OPEN', archivedAt: new Date() })).toBe(false);
    expect(isJobAdvertisable({ status: 'OPEN', employerArchivedAt: new Date() })).toBe(false);
    expect(jobIneligibility({ status: 'CLOSED' })?.code).toBe('CAMPAIGN_JOB_CLOSED');
    expect(jobIneligibility({ status: 'FILLED' })?.code).toBe('CAMPAIGN_JOB_NOT_ADVERTISABLE');
  });

  it('the job picker offers only advertisable jobs', async () => {
    const picker = await cs.fetchJobsForCampaignPicker(ids.employer);
    const offered = new Set(picker.map((j) => j.id));
    for (const k of ['open', 'inProgress', 'partly'] as const)
      expect(offered.has(ids.jobs[k])).toBe(true);
    for (const k of ['draft', 'filled', 'closed', 'cancelled', 'archived', 'other'] as const) {
      expect(offered.has(ids.jobs[k])).toBe(false);
    }
  });
});

describe('campaign save — two kinds, employer derived from the job', () => {
  it('a talent-pool campaign saves with no employer and no job', async () => {
    const c = await save({ name: `${STAMP} pool`, jobRequisitionId: '', employerId: '' });
    const row = await cs.fetchCampaign(c.id);
    expect(row?.jobRequisitionId).toBeNull();
    expect(row?.employerId).toBeNull();
    expect(row?.status).toBe('DRAFT');
  });

  it('a job campaign derives its employer from the job (none sent)', async () => {
    const c = await save({ name: `${STAMP} job`, jobRequisitionId: ids.jobs.open });
    const row = await cs.fetchCampaign(c.id);
    expect(row?.jobRequisitionId).toBe(ids.jobs.open);
    expect(row?.employerId).toBe(ids.employer);
    // The matching employer is accepted as a cross-check.
    const c2 = await save({
      name: `${STAMP} job2`,
      jobRequisitionId: ids.jobs.open,
      employerId: ids.employer,
    });
    expect((await cs.fetchCampaign(c2.id))?.employerId).toBe(ids.employer);
  });

  it('a mismatched employerId is refused and nothing is stored', async () => {
    const before = await campaignCount();
    await expect(
      save({
        name: `${STAMP} mismatch`,
        jobRequisitionId: ids.jobs.other,
        employerId: ids.employer,
      }),
    ).rejects.toMatchObject({ code: 'CAMPAIGN_EMPLOYER_MISMATCH' });
    expect(await campaignCount()).toBe(before);
    // Also on edit: a forged employer for the existing job.
    const c = await save({ name: `${STAMP} edit-mismatch`, jobRequisitionId: ids.jobs.open });
    await expect(
      save({
        id: c.id,
        name: `${STAMP} edit-mismatch`,
        jobRequisitionId: ids.jobs.open,
        employerId: ids.otherEmployer,
      }),
    ).rejects.toMatchObject({ code: 'CAMPAIGN_EMPLOYER_MISMATCH' });
  });

  it('an employer without a job is refused (no employer-only campaigns)', async () => {
    const before = await campaignCount();
    await expect(
      save({ name: `${STAMP} emp-only`, jobRequisitionId: '', employerId: ids.employer }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(await campaignCount()).toBe(before);
  });

  it('ineligible jobs are refused on create and when re-pointing a campaign', async () => {
    const cases: Array<[JobKey, string, RegExp]> = [
      ['archived', 'CAMPAIGN_JOB_NOT_ADVERTISABLE', /archived/],
      ['closed', 'CAMPAIGN_JOB_CLOSED', /closed/],
      ['cancelled', 'CAMPAIGN_JOB_CLOSED', /cancelled/],
      ['filled', 'CAMPAIGN_JOB_NOT_ADVERTISABLE', /filled/],
      ['draft', 'CAMPAIGN_JOB_NOT_ADVERTISABLE', /draft/],
    ];
    const pool = await save({ name: `${STAMP} repoint`, jobRequisitionId: '' });
    for (const [key, code, message] of cases) {
      await expect(
        save({ name: `${STAMP} bad-${key}`, jobRequisitionId: ids.jobs[key] }),
      ).rejects.toMatchObject({ code, message: expect.stringMatching(message) });
      await expect(
        save({ id: pool.id, name: `${STAMP} repoint`, jobRequisitionId: ids.jobs[key] }),
      ).rejects.toMatchObject({ code });
    }
    expect((await cs.fetchCampaign(pool.id))?.jobRequisitionId).toBeNull();
  });
});

describe('activation needs an advertisable job', () => {
  async function campaignOnFreshJob(status: 'FILLED' | 'CLOSED' | 'DRAFT' | 'ARCHIVED') {
    const [job] = await db
      .insert(jobRequisitions)
      .values({
        assignedUserId: session.user.id,
        employerId: ids.employer,
        title: `${STAMP} act-${status}`,
        positionsRequired: 1,
        employmentType: 'FULL_TIME',
        status: 'OPEN',
      })
      .returning({ id: jobRequisitions.id });
    if (!job) throw new Error('seed failed');
    ids.jobs[`act${status}` as JobKey] = job.id;
    const c = await save({ name: `${STAMP} act ${status}`, jobRequisitionId: job.id });
    // The job changes after the campaign was created (e.g. it got filled).
    await db
      .update(jobRequisitions)
      .set(status === 'ARCHIVED' ? { archivedAt: new Date() } : { status })
      .where(eq(jobRequisitions.id, job.id));
    return c.id;
  }

  it('a draft campaign whose job became filled / closed / draft / archived cannot be activated', async () => {
    for (const s of ['FILLED', 'CLOSED', 'DRAFT', 'ARCHIVED'] as const) {
      const id = await campaignOnFreshJob(s);
      await expect(cs.transitionCampaign({ campaignId: id, to: 'ACTIVE' })).rejects.toMatchObject({
        code: expect.stringMatching(/^CAMPAIGN_JOB_(CLOSED|NOT_ADVERTISABLE)$/),
        message: expect.stringMatching(/cannot be activated/),
      });
      // …but it still opens, shows its job and employer, and can be renamed.
      const row = await cs.fetchCampaign(id);
      expect(row?.employerId).toBe(ids.employer);
      const renamed = await save({
        id,
        name: `${STAMP} act ${s} renamed`,
        jobRequisitionId: row?.jobRequisitionId ?? '',
      });
      expect(renamed.name).toContain('renamed');
      expect(renamed.status).toBe('DRAFT');
    }
  });

  it('a paused campaign whose job was filled cannot be resumed', async () => {
    const [job] = await db
      .insert(jobRequisitions)
      .values({
        assignedUserId: session.user.id,
        employerId: ids.employer,
        title: `${STAMP} resume`,
        positionsRequired: 1,
        employmentType: 'FULL_TIME',
        status: 'OPEN',
      })
      .returning({ id: jobRequisitions.id });
    if (!job) throw new Error('seed failed');
    ids.jobs['resume' as JobKey] = job.id;
    const c = await save({ name: `${STAMP} resume`, jobRequisitionId: job.id });
    await cs.transitionCampaign({ campaignId: c.id, to: 'ACTIVE' });
    await cs.transitionCampaign({ campaignId: c.id, to: 'PAUSED' });
    await db
      .update(jobRequisitions)
      .set({ status: 'FILLED' })
      .where(eq(jobRequisitions.id, job.id));
    await expect(cs.transitionCampaign({ campaignId: c.id, to: 'ACTIVE' })).rejects.toMatchObject({
      message: expect.stringMatching(/filled, so the campaign cannot be resumed/),
    });
    // Ending it is still allowed.
    const done = await cs.transitionCampaign({ campaignId: c.id, to: 'COMPLETED' });
    expect(done.status).toBe('COMPLETED');
  });

  it('talent-pool campaigns activate with no job', async () => {
    const c = await save({ name: `${STAMP} pool-act`, jobRequisitionId: '' });
    expect((await cs.transitionCampaign({ campaignId: c.id, to: 'ACTIVE' })).status).toBe('ACTIVE');
  });
});

describe('prospect capture — only on live adverts', () => {
  it('a draft campaign / a never-live advert takes no prospects', async () => {
    const draft = await save({ name: `${STAMP} draft-cap`, jobRequisitionId: ids.jobs.open });
    const draftAd = await cs.upsertAdvertisement({
      campaignId: draft.id,
      country: 'Ireland',
      targetApplicants: 5,
      startDate: '2026-11-01',
      expiryDate: '2026-12-01',
      status: 'DRAFT',
    });
    await expect(
      ps.createProspect({ advertisementId: draftAd.id, personId: await seedPerson('draftcap') }),
    ).rejects.toMatchObject({ code: 'CAMPAIGN_NOT_LIVE' });
    // Campaign activated, but the advert itself was never marked live.
    await cs.transitionCampaign({ campaignId: draft.id, to: 'ACTIVE' });
    await expect(
      ps.createProspect({ advertisementId: draftAd.id, personId: await seedPerson('draftad') }),
    ).rejects.toMatchObject({ code: 'AD_NOT_LIVE' });
  });
});

describe('prospect duplicate check', () => {
  it('a name-only match warns; "different person" creates them (audited); email still blocks', async () => {
    const { adId } = await liveCampaignWithAd();
    const first = `Mary${Date.now()}`;
    await seedPerson('mary1', {
      firstName: first,
      lastName: STAMP,
      email: `m1-${STAMP}@example.test`,
    });
    const newMary = {
      firstName: first,
      lastName: STAMP,
      email: `m2-${STAMP}@example.test`,
    };
    await expect(
      ps.createProspect({ advertisementId: adId, newPerson: newMary }),
    ).rejects.toMatchObject({
      code: 'PROSPECT_NAME_MATCH',
      message: expect.stringContaining(`m1-${STAMP}@example.test`),
    });
    const p = await ps.createProspect({
      advertisementId: adId,
      newPerson: newMary,
      confirmDifferentPerson: true,
    });
    const [created] = await db.select().from(persons).where(eq(persons.id, p.personId));
    expect(created?.email).toBe(`m2-${STAMP}@example.test`);
    const [audit] = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.entityId, p.personId), eq(auditEvents.action, 'CREATED')));
    expect(audit?.context).toMatchObject({ via: 'prospect_capture', nameMatchOverridden: true });

    // Same email is a hard block even when "different person" is ticked.
    await expect(
      ps.createProspect({
        advertisementId: adId,
        newPerson: {
          firstName: 'Other',
          lastName: `Name${STAMP}`,
          email: `M1-${STAMP}@example.test`,
        },
        confirmDifferentPerson: true,
      }),
    ).rejects.toMatchObject({ code: 'PROSPECT_POSSIBLE_DUPLICATE' });
  });
});

describe('closing a prospect cancels the open follow-up', () => {
  const openFollowUps = async (personId: string) =>
    db
      .select({ id: tasks.id, status: tasks.status })
      .from(tasks)
      .where(and(eq(tasks.personId, personId), like(tasks.description, '%Ref: prospect %')));

  it('converting cancels it (audited)', async () => {
    const { adId } = await liveCampaignWithAd();
    const personId = await seedPerson('conv');
    const p = await ps.createProspect({ advertisementId: adId, personId });
    await ps.setProspectFollowUp({ prospectId: p.id, dueOn: '2030-01-15' });
    expect((await openFollowUps(personId)).map((t) => t.status)).toEqual(['OPEN']);
    await ps.updateProspectStatus({ prospectId: p.id, status: 'SCREENED' });
    await ps.convertProspectToCandidate({ prospectId: p.id, confirmed: true });
    const after = await openFollowUps(personId);
    expect(after.map((t) => t.status)).toEqual(['CANCELLED']);
    const [audit] = await db
      .select()
      .from(auditEvents)
      .where(
        and(eq(auditEvents.entityId, after[0]?.id ?? ''), eq(auditEvents.action, 'STATUS_CHANGED')),
      );
    expect(audit?.context).toMatchObject({ via: 'prospect_closed', prospectId: p.id });
    // The list no longer shows a follow-up for the converted prospect.
    const [row] = (await cs.fetchProspects({ q: 'P0conv' })).filter((r) => r.id === p.id);
    expect(row?.followUpDueAt).toBeNull();
  });

  it('marking not suitable cancels it', async () => {
    const { adId } = await liveCampaignWithAd();
    const personId = await seedPerson('ns');
    const p = await ps.createProspect({ advertisementId: adId, personId });
    await ps.setProspectFollowUp({ prospectId: p.id, dueOn: '2030-01-16' });
    await ps.updateProspectStatus({
      prospectId: p.id,
      status: 'NOT_SUITABLE',
      notes: 'No certificate',
    });
    expect((await openFollowUps(personId)).map((t) => t.status)).toEqual(['CANCELLED']);
  });

  it('screening keeps the follow-up open', async () => {
    const { adId } = await liveCampaignWithAd();
    const personId = await seedPerson('keep');
    const p = await ps.createProspect({ advertisementId: adId, personId });
    await ps.setProspectFollowUp({ prospectId: p.id, dueOn: '2030-01-17' });
    await ps.updateProspectStatus({ prospectId: p.id, status: 'SCREENED' });
    expect((await openFollowUps(personId)).map((t) => t.status)).toEqual(['OPEN']);
  });
});
