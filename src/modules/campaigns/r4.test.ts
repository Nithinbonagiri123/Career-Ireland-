import { and, eq, inArray, like, sql } from 'drizzle-orm';
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
  jobApplications,
  jobRequisitions,
  shortlistEntries,
} from '@/lib/db/schema/recruitment';
import { type UserRole, users } from '@/lib/db/schema/users';

/**
 * R4 — campaigns, advertisements and prospects against the real DB.
 * Permissions come from the real role presets: RECRUITER has
 * recruitment.campaigns / prospects (view, create, edit); STAFF and
 * FINANCE have neither.
 */

const session = {
  user: {
    id: '',
    email: 'r4@example.test',
    name: 'R4 Tester',
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

const STAMP = `vitest-r4-${Date.now()}`;
const ids = {
  user: '',
  employer: '',
  otherEmployer: '',
  job: '',
  closedJob: '',
  otherJob: '',
  campaigns: [] as string[],
  persons: [] as string[],
};

async function seedPerson(tag: string, extra: Partial<typeof persons.$inferInsert> = {}) {
  const [p] = await db
    .insert(persons)
    .values({ firstName: `R4${tag}`, lastName: STAMP, source: 'DIRECT', ...extra })
    .returning({ id: persons.id });
  if (!p) throw new Error('seed failed');
  ids.persons.push(p.id);
  return p.id;
}

async function newCampaign(jobId: string | null = ids.job, activate = true) {
  const c = await cs.saveCampaign({ name: `${STAMP} campaign`, jobRequisitionId: jobId ?? '' });
  ids.campaigns.push(c.id);
  if (activate) await cs.transitionCampaign({ campaignId: c.id, to: 'ACTIVE' });
  return c.id;
}

async function newAd(
  campaignId: string,
  status: 'DRAFT' | 'ACTIVE' = 'ACTIVE',
  country = 'Ireland',
) {
  return cs.upsertAdvertisement({
    campaignId,
    country,
    platform: 'IrishJobs',
    targetApplicants: 5,
    startDate: '2026-11-01',
    expiryDate: '2026-12-01',
    status,
  });
}

const audits = (entityId: string) =>
  db.select().from(auditEvents).where(eq(auditEvents.entityId, entityId));

beforeAll(async () => {
  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'e2e-admin@ireland-careers.test'))
    .limit(1);
  if (!admin) throw new Error('e2e admin seed missing');
  ids.user = admin.id;
  session.user.id = admin.id;
  const [emp, other] = await db
    .insert(employers)
    .values([{ legalName: `${STAMP} Care` }, { legalName: `${STAMP} Other` }])
    .returning({ id: employers.id });
  if (!emp || !other) throw new Error('seed failed');
  ids.employer = emp.id;
  ids.otherEmployer = other.id;
  const jobs = await db
    .insert(jobRequisitions)
    .values([
      {
        employerId: emp.id,
        title: `${STAMP} nurse`,
        positionsRequired: 2,
        employmentType: 'FULL_TIME',
        status: 'OPEN',
      },
      {
        employerId: emp.id,
        title: `${STAMP} closed`,
        positionsRequired: 1,
        employmentType: 'FULL_TIME',
        status: 'CLOSED',
      },
      {
        employerId: other.id,
        title: `${STAMP} other`,
        positionsRequired: 1,
        employmentType: 'FULL_TIME',
        status: 'OPEN',
      },
    ])
    .returning({ id: jobRequisitions.id });
  ids.job = jobs[0]?.id ?? '';
  ids.closedJob = jobs[1]?.id ?? '';
  ids.otherJob = jobs[2]?.id ?? '';
});

beforeEach(() => {
  session.user.role = 'RECRUITER';
});

afterAll(async () => {
  const camps = ids.campaigns;
  const ads = camps.length
    ? await db
        .select({ id: advertisements.id })
        .from(advertisements)
        .where(inArray(advertisements.campaignId, camps))
    : [];
  const adIds = ads.map((a) => a.id);
  const prospects = adIds.length
    ? await db
        .select({ id: recruitmentProspects.id })
        .from(recruitmentProspects)
        .where(inArray(recruitmentProspects.advertisementId, adIds))
    : [];
  const people = await db
    .select({ id: persons.id })
    .from(persons)
    .where(eq(persons.lastName, STAMP));
  const personIds = [...new Set([...ids.persons, ...people.map((p) => p.id)])];
  const taskRows = personIds.length
    ? await db.select({ id: tasks.id }).from(tasks).where(inArray(tasks.personId, personIds))
    : [];
  const profiles = personIds.length
    ? await db
        .select({ id: candidateProfiles.id })
        .from(candidateProfiles)
        .where(inArray(candidateProfiles.personId, personIds))
    : [];
  const jobIds = [ids.job, ids.closedJob, ids.otherJob];
  const sl = await db
    .select({ id: shortlistEntries.id })
    .from(shortlistEntries)
    .where(inArray(shortlistEntries.jobRequisitionId, jobIds));
  const cm = await db
    .select({ id: candidateMatches.id })
    .from(candidateMatches)
    .where(inArray(candidateMatches.jobRequisitionId, jobIds));
  const entityIds = [
    ...camps,
    ...adIds,
    ...prospects.map((p) => p.id),
    ...personIds,
    ...taskRows.map((t) => t.id),
    ...profiles.map((p) => p.id),
    ...sl.map((s) => s.id),
    ...cm.map((c) => c.id),
  ];
  if (entityIds.length)
    await db.delete(auditEvents).where(inArray(auditEvents.entityId, entityIds));
  if (personIds.length) await db.delete(tasks).where(inArray(tasks.personId, personIds));
  if (adIds.length) {
    await db.delete(tasks).where(inArray(tasks.advertisementId, adIds));
    await db
      .delete(recruitmentProspects)
      .where(inArray(recruitmentProspects.advertisementId, adIds));
    await db.delete(advertisements).where(inArray(advertisements.id, adIds));
  }
  if (camps.length)
    await db.delete(recruitmentCampaigns).where(inArray(recruitmentCampaigns.id, camps));
  await db.delete(shortlistEntries).where(inArray(shortlistEntries.jobRequisitionId, jobIds));
  await db.delete(candidateMatches).where(inArray(candidateMatches.jobRequisitionId, jobIds));
  if (personIds.length) {
    await db.delete(candidateProfiles).where(inArray(candidateProfiles.personId, personIds));
    // Matching runs in other test files score every candidate, so this
    // file's people can gain matches on other jobs; clear those first and
    // retry if one lands in between.
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
  await db.delete(jobRequisitions).where(inArray(jobRequisitions.id, jobIds));
  await db.delete(employers).where(inArray(employers.id, [ids.employer, ids.otherEmployer]));
});

describe('campaign lifecycle', () => {
  it('creates as DRAFT, activates, completes; finished campaigns cannot reopen', async () => {
    const id = await newCampaign(ids.job, false);
    const [draft] = await db
      .select()
      .from(recruitmentCampaigns)
      .where(eq(recruitmentCampaigns.id, id));
    expect(draft?.status).toBe('DRAFT');
    const active = await cs.transitionCampaign({ campaignId: id, to: 'ACTIVE' });
    expect(active.startedAt).toBeInstanceOf(Date);
    await expect(cs.transitionCampaign({ campaignId: id, to: 'ACTIVE' })).rejects.toMatchObject({
      code: 'CAMPAIGN_ALREADY_IN_STATUS',
    });
    const done = await cs.transitionCampaign({ campaignId: id, to: 'COMPLETED' });
    expect(done.endedAt).toBeInstanceOf(Date);
    await expect(cs.transitionCampaign({ campaignId: id, to: 'ACTIVE' })).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
    });
    const actions = (await audits(id)).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['CREATED', 'STATUS_CHANGED']));
  });

  it('cancelling needs a reason and closes the campaign’s open ads (audited)', async () => {
    const id = await newCampaign();
    const ad = await newAd(id);
    await expect(cs.transitionCampaign({ campaignId: id, to: 'CANCELLED' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      fields: { reason: expect.any(String) },
    });
    await cs.transitionCampaign({ campaignId: id, to: 'CANCELLED', reason: 'Role withdrawn' });
    const [adAfter] = await db.select().from(advertisements).where(eq(advertisements.id, ad.id));
    expect(adAfter?.status).toBe('CLOSED');
    expect(
      (await audits(ad.id)).some((a) => (a.context as { via?: string })?.via === 'campaign_ended'),
    ).toBe(true);
    const cancel = (await audits(id)).find(
      (a) => (a.after as { status?: string })?.status === 'CANCELLED',
    );
    expect(cancel?.context).toMatchObject({ reason: 'Role withdrawn' });
  });

  it('links only to a job of the chosen employer, never to a closed job', async () => {
    await expect(
      cs.saveCampaign({
        name: `${STAMP} x`,
        employerId: ids.employer,
        jobRequisitionId: ids.otherJob,
      }),
    ).rejects.toMatchObject({ code: 'CAMPAIGN_EMPLOYER_MISMATCH' });
    await expect(
      cs.saveCampaign({ name: `${STAMP} x`, employerId: ids.employer, jobRequisitionId: '' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      cs.saveCampaign({ name: `${STAMP} x`, jobRequisitionId: ids.closedJob }),
    ).rejects.toMatchObject({ code: 'CAMPAIGN_JOB_CLOSED' });
    const ok = await cs.saveCampaign({
      name: `${STAMP} linked`,
      employerId: ids.employer,
      jobRequisitionId: ids.job,
    });
    ids.campaigns.push(ok.id);
    const row = await cs.fetchCampaign(ok.id);
    expect(row?.employerId).toBe(ids.employer);
  });

  it('the job cannot change once the campaign has prospects', async () => {
    const id = await newCampaign();
    const ad = await newAd(id);
    await ps.createProspect({ advertisementId: ad.id, personId: await seedPerson('lock') });
    await expect(
      cs.saveCampaign({ id, name: `${STAMP} campaign`, jobRequisitionId: ids.otherJob }),
    ).rejects.toMatchObject({ code: 'CAMPAIGN_JOB_LOCKED' });
    // Renaming is still fine.
    const renamed = await cs.saveCampaign({
      id,
      name: `${STAMP} renamed`,
      jobRequisitionId: ids.job,
    });
    expect(renamed.name).toBe(`${STAMP} renamed`);
  });

  it('active campaigns cannot be archived; archive + restore need reasons and block edits', async () => {
    const id = await newCampaign();
    await expect(cs.archiveCampaign({ campaignId: id, reason: 'Done here' })).rejects.toMatchObject(
      {
        code: 'CAMPAIGN_ACTIVE',
      },
    );
    await cs.transitionCampaign({ campaignId: id, to: 'COMPLETED' });
    await cs.archiveCampaign({ campaignId: id, reason: 'Done here' });
    await expect(
      cs.saveCampaign({ id, name: 'Nope nope', jobRequisitionId: ids.job }),
    ).rejects.toMatchObject({
      code: 'CAMPAIGN_ARCHIVED',
    });
    await cs.unarchiveCampaign({ campaignId: id, reason: 'Needed for report' });
    expect((await audits(id)).map((a) => a.action)).toEqual(
      expect.arrayContaining(['ARCHIVED', 'UNARCHIVED']),
    );
  });
});

describe('advertisements', () => {
  it('an ad can run only under an active campaign and follows its own transitions', async () => {
    const draftCampaign = await newCampaign(ids.job, false);
    await expect(newAd(draftCampaign, 'ACTIVE')).rejects.toMatchObject({
      code: 'AD_CAMPAIGN_NOT_ACTIVE',
    });
    const ad = await newAd(draftCampaign, 'DRAFT');
    await cs.transitionCampaign({ campaignId: draftCampaign, to: 'ACTIVE' });
    const base = {
      id: ad.id,
      campaignId: draftCampaign,
      country: 'Ireland',
      targetApplicants: 5,
      startDate: '2026-11-01',
      expiryDate: '2026-12-01',
    };
    await cs.upsertAdvertisement({ ...base, status: 'CLOSED' });
    await expect(cs.upsertAdvertisement({ ...base, status: 'ACTIVE' })).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
    });
    const other = await newCampaign();
    await expect(
      cs.upsertAdvertisement({ ...base, campaignId: other, status: 'CLOSED' }),
    ).rejects.toMatchObject({ code: 'AD_CAMPAIGN_MISMATCH' });
    await expect(
      cs.upsertAdvertisement({ ...base, id: undefined, expiryDate: '2026-10-01', status: 'DRAFT' }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      fields: { expiryDate: expect.any(String) },
    });
  });

  it('a finished campaign takes no new ads', async () => {
    const id = await newCampaign();
    await cs.transitionCampaign({ campaignId: id, to: 'COMPLETED' });
    await expect(newAd(id, 'DRAFT')).rejects.toMatchObject({ code: 'CAMPAIGN_ENDED' });
  });
});

describe('prospects', () => {
  it('one prospect per person per campaign, across all its ads', async () => {
    const id = await newCampaign();
    const ie = await newAd(id, 'ACTIVE', 'Ireland');
    const za = await newAd(id, 'ACTIVE', 'South Africa');
    const person = await seedPerson('dup');
    await ps.createProspect({ advertisementId: ie.id, personId: person });
    await expect(
      ps.createProspect({ advertisementId: ie.id, personId: person }),
    ).rejects.toMatchObject({
      code: 'PROSPECT_EXISTS',
    });
    await expect(
      ps.createProspect({ advertisementId: za.id, personId: person }),
    ).rejects.toMatchObject({
      code: 'PROSPECT_EXISTS',
    });
    // Same person in a different campaign is allowed.
    const other = await newCampaign();
    const otherAd = await newAd(other);
    await ps.createProspect({ advertisementId: otherAd.id, personId: person });
  });

  it('capturing a new person refuses likely duplicates and creates nobody', async () => {
    const id = await newCampaign();
    const ad = await newAd(id);
    const email = `r4-dup-${Date.now()}@example.test`;
    await seedPerson('existing', { email });
    const before = await db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(persons)
      .where(eq(persons.lastName, STAMP));
    await expect(
      ps.createProspect({
        advertisementId: ad.id,
        newPerson: { firstName: 'Brand', lastName: 'New', email: email.toUpperCase() },
      }),
    ).rejects.toMatchObject({ code: 'PROSPECT_POSSIBLE_DUPLICATE' });
    const after = await db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(persons)
      .where(eq(persons.lastName, STAMP));
    expect(after[0]?.n).toBe(before[0]?.n);
  });

  it('a genuinely new person is created with source ADVERTISEMENT and audited', async () => {
    const id = await newCampaign();
    const ad = await newAd(id);
    const p = await ps.createProspect({
      advertisementId: ad.id,
      newPerson: {
        firstName: 'Fresh',
        lastName: STAMP,
        email: `r4-new-${Date.now()}@example.test`,
      },
      notes: 'Called after seeing the ad',
    });
    const [person] = await db.select().from(persons).where(eq(persons.id, p.personId));
    expect(person?.source).toBe('ADVERTISEMENT');
    expect(p.notes).toContain('Called after seeing the ad');
    expect(
      (await audits(p.personId)).some(
        (a) => (a.context as { via?: string })?.via === 'prospect_capture',
      ),
    ).toBe(true);
  });

  it('cancelled campaigns and closed ads take no prospects', async () => {
    const id = await newCampaign();
    const ad = await newAd(id);
    const closedAd = await newAd(id, 'ACTIVE', 'Poland');
    await cs.upsertAdvertisement({
      id: closedAd.id,
      campaignId: id,
      country: 'Poland',
      targetApplicants: 5,
      startDate: '2026-11-01',
      expiryDate: '2026-12-01',
      status: 'CLOSED',
    });
    await expect(
      ps.createProspect({ advertisementId: closedAd.id, personId: await seedPerson('closed') }),
    ).rejects.toMatchObject({ code: 'AD_CLOSED' });
    await cs.transitionCampaign({ campaignId: id, to: 'CANCELLED', reason: 'Budget pulled' });
    await expect(
      ps.createProspect({ advertisementId: ad.id, personId: await seedPerson('cancel') }),
    ).rejects.toMatchObject({ code: 'CAMPAIGN_ENDED' });
  });

  it('status follows the prospect rules; not suitable needs a reason; conversion is not a manual status', async () => {
    const id = await newCampaign();
    const ad = await newAd(id);
    const p = await ps.createProspect({ advertisementId: ad.id, personId: await seedPerson('st') });
    await expect(
      ps.updateProspectStatus({ prospectId: p.id, status: 'CONVERTED_TO_CANDIDATE' as 'SCREENED' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      ps.updateProspectStatus({ prospectId: p.id, status: 'NOT_SUITABLE' }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      fields: { notes: expect.any(String) },
    });
    const ns = await ps.updateProspectStatus({
      prospectId: p.id,
      status: 'NOT_SUITABLE',
      notes: 'No nursing registration',
    });
    expect(ns.notes).toMatch(/Marked not suitable: No nursing registration/);
    await expect(
      ps.updateProspectStatus({ prospectId: p.id, status: 'RETAINED_IN_POOL' }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });
    await ps.updateProspectStatus({ prospectId: p.id, status: 'SCREENED' });
    await expect(
      ps.updateProspectStatus({ prospectId: p.id, status: 'SCREENED' }),
    ).rejects.toMatchObject({
      code: 'PROSPECT_ALREADY_IN_STATUS',
    });
    const noted = await ps.addProspectNote({ prospectId: p.id, note: 'Available from January' });
    expect(noted.notes).toMatch(/· .*\] Available from January/);
  });

  it('follow-up is one open task, due 09:00 Irish time, replaced or cleared with audit', async () => {
    const id = await newCampaign();
    const ad = await newAd(id);
    const personId = await seedPerson('fu');
    const p = await ps.createProspect({ advertisementId: ad.id, personId });
    await expect(
      ps.setProspectFollowUp({ prospectId: p.id, dueOn: '2020-01-01' }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    await ps.setProspectFollowUp({ prospectId: p.id, dueOn: '2027-03-10' });
    const r = await ps.setProspectFollowUp({ prospectId: p.id, dueOn: '2027-03-12' });
    expect(r.dueAt?.toISOString()).toBe('2027-03-12T09:00:00.000Z'); // GMT in March before DST
    const open = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.personId, personId), inArray(tasks.status, ['OPEN', 'IN_PROGRESS'])));
    expect(open).toHaveLength(1);
    expect(open[0]?.assignedUserId).toBe(ids.user);
    const rows = await cs.fetchCampaignProspects(id);
    expect(rows[0]?.followUpDueAt?.toISOString()).toBe('2027-03-12T09:00:00.000Z');
    await ps.setProspectFollowUp({ prospectId: p.id, dueOn: '' });
    const stillOpen = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.personId, personId),
          like(tasks.description, `%${p.id}%`),
          eq(tasks.status, 'OPEN'),
        ),
      );
    expect(stillOpen).toHaveLength(0);
    expect((await audits(p.id)).map((a) => a.action)).toEqual(
      expect.arrayContaining(['FOLLOW_UP_SET', 'FOLLOW_UP_CLEARED']),
    );
  });
});

describe('conversion hand-off', () => {
  it('needs the confirmation and a screened prospect; never creates an application', async () => {
    const id = await newCampaign();
    const ad = await newAd(id);
    const personId = await seedPerson('conv');
    const p = await ps.createProspect({ advertisementId: ad.id, personId });
    await expect(
      ps.convertProspectToCandidate({ prospectId: p.id, confirmed: false as unknown as true }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      fields: { confirmed: expect.any(String) },
    });
    await expect(
      ps.convertProspectToCandidate({ prospectId: p.id, confirmed: true }),
    ).rejects.toMatchObject({
      code: 'PROSPECT_NOT_SCREENED',
    });
    await ps.updateProspectStatus({ prospectId: p.id, status: 'SCREENED' });
    const r = await ps.convertProspectToCandidate({ prospectId: p.id, confirmed: true });
    expect(r.created).toBe(true);
    expect(r.prospect.status).toBe('CONVERTED_TO_CANDIDATE');
    await expect(
      ps.convertProspectToCandidate({ prospectId: p.id, confirmed: true }),
    ).rejects.toMatchObject({
      code: 'PROSPECT_ALREADY_CONVERTED',
    });
    const apps = await db
      .select()
      .from(jobApplications)
      .where(eq(jobApplications.personId, personId));
    expect(apps).toHaveLength(0);
    const sl = await db
      .select()
      .from(shortlistEntries)
      .where(eq(shortlistEntries.personId, personId));
    expect(sl).toHaveLength(0);
    expect((await audits(p.id)).find((a) => a.action === 'CONVERTED')?.context).toMatchObject({
      confirmed: true,
      profileCreated: true,
    });
  });

  it('reuses an existing candidate profile — no duplicate candidate', async () => {
    const personId = await seedPerson('reuse');
    await db
      .insert(candidateProfiles)
      .values({ personId, lifecycleStatus: 'ACTIVE', availabilityStatus: 'AVAILABLE' });
    const id = await newCampaign();
    const ad = await newAd(id);
    const p = await ps.createProspect({ advertisementId: ad.id, personId });
    await ps.updateProspectStatus({ prospectId: p.id, status: 'RETAINED_IN_POOL' });
    const r = await ps.convertProspectToCandidate({ prospectId: p.id, confirmed: true });
    expect(r.created).toBe(false);
    const profiles = await db
      .select()
      .from(candidateProfiles)
      .where(eq(candidateProfiles.personId, personId));
    expect(profiles).toHaveLength(1);
  });

  it('can shortlist on the campaign’s job (R2 path) when asked — still no application', async () => {
    const id = await newCampaign();
    const ad = await newAd(id);
    const personId = await seedPerson('short');
    const p = await ps.createProspect({ advertisementId: ad.id, personId });
    await ps.updateProspectStatus({ prospectId: p.id, status: 'SCREENED' });
    const r = await ps.convertProspectToCandidate({
      prospectId: p.id,
      confirmed: true,
      shortlistOnJob: true,
    });
    expect(r.shortlisted).toBe(true);
    const sl = await db
      .select()
      .from(shortlistEntries)
      .where(eq(shortlistEntries.personId, personId));
    expect(sl).toHaveLength(1);
    expect(sl[0]?.jobRequisitionId).toBe(ids.job);
    const apps = await db
      .select()
      .from(jobApplications)
      .where(eq(jobApplications.personId, personId));
    expect(apps).toHaveLength(0);

    const pool = await newCampaign(null);
    const poolAd = await newAd(pool);
    const p2 = await ps.createProspect({
      advertisementId: poolAd.id,
      personId: await seedPerson('pool'),
    });
    await ps.updateProspectStatus({ prospectId: p2.id, status: 'SCREENED' });
    await expect(
      ps.convertProspectToCandidate({ prospectId: p2.id, confirmed: true, shortlistOnJob: true }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('authorization', () => {
  it('STAFF and FINANCE cannot write campaigns or prospects; reads stay available', async () => {
    const id = await newCampaign();
    const ad = await newAd(id);
    const personId = await seedPerson('auth');
    const p = await ps.createProspect({ advertisementId: ad.id, personId });
    for (const role of ['STAFF', 'FINANCE'] as const) {
      session.user.role = role;
      await expect(cs.saveCampaign({ name: 'Blocked one' })).rejects.toMatchObject({
        code: 'AUTHORIZATION_ERROR',
      });
      await expect(
        cs.transitionCampaign({ campaignId: id, to: 'COMPLETED' }),
      ).rejects.toMatchObject({
        code: 'AUTHORIZATION_ERROR',
      });
      await expect(newAd(id)).rejects.toMatchObject({ code: 'AUTHORIZATION_ERROR' });
      await expect(
        ps.createProspect({ advertisementId: ad.id, personId: await seedPerson(`a${role}`) }),
      ).rejects.toMatchObject({ code: 'AUTHORIZATION_ERROR' });
      await expect(
        ps.updateProspectStatus({ prospectId: p.id, status: 'SCREENED' }),
      ).rejects.toMatchObject({
        code: 'AUTHORIZATION_ERROR',
      });
      await expect(
        ps.convertProspectToCandidate({ prospectId: p.id, confirmed: true }),
      ).rejects.toMatchObject({
        code: 'AUTHORIZATION_ERROR',
      });
      await expect(ps.setProspectFollowUp({ prospectId: p.id, dueOn: '' })).rejects.toMatchObject({
        code: 'AUTHORIZATION_ERROR',
      });
    }
    session.user.role = 'STAFF';
    expect(await cs.fetchCampaign(id)).not.toBeNull();
    // Nothing changed.
    const [c] = await db.select().from(recruitmentCampaigns).where(eq(recruitmentCampaigns.id, id));
    expect(c?.status).toBe('ACTIVE');
  });
});

describe('pause / resume', () => {
  const adStatus = async (id: string) =>
    (
      await db
        .select({ s: advertisements.status })
        .from(advertisements)
        .where(eq(advertisements.id, id))
    )[0]?.s;
  const adFields = (campaignId: string, id: string, country: string) => ({
    id,
    campaignId,
    country,
    platform: 'IrishJobs',
    targetApplicants: 5,
    startDate: '2026-11-01',
    expiryDate: '2026-12-01',
  });

  it('pausing suspends running ads only; resuming restarts none; ads are reactivated one by one', async () => {
    const id = await newCampaign();
    const running = await newAd(id, 'ACTIVE', 'Ireland');
    const draft = await newAd(id, 'DRAFT', 'Poland');
    await cs.transitionCampaign({ campaignId: id, to: 'PAUSED' });
    expect(await adStatus(running.id)).toBe('PAUSED');
    expect(await adStatus(draft.id)).toBe('DRAFT');
    const suspendAudit = (await audits(running.id)).find(
      (a) => (a.context as { via?: string })?.via === 'campaign_paused',
    );
    expect(suspendAudit?.before).toEqual({ status: 'ACTIVE' });
    expect(suspendAudit?.after).toEqual({ status: 'PAUSED' });

    // While paused, an ad cannot be set running again.
    await expect(
      cs.upsertAdvertisement({ ...adFields(id, running.id, 'Ireland'), status: 'ACTIVE' }),
    ).rejects.toMatchObject({ code: 'AD_CAMPAIGN_NOT_ACTIVE' });

    const resumed = await cs.transitionCampaign({ campaignId: id, to: 'ACTIVE' });
    expect(resumed.status).toBe('ACTIVE');
    expect(resumed.endedAt).toBeNull();
    expect(await adStatus(running.id)).toBe('PAUSED'); // not restarted automatically
    const resumeAudit = (await audits(id)).find(
      (a) => (a.context as { resumed?: boolean })?.resumed,
    );
    expect(resumeAudit?.after).toEqual({ status: 'ACTIVE' });

    await cs.upsertAdvertisement({ ...adFields(id, running.id, 'Ireland'), status: 'ACTIVE' });
    expect(await adStatus(running.id)).toBe('ACTIVE');
    expect(
      (await audits(running.id)).some(
        (a) =>
          a.action === 'STATUS_CHANGED' && (a.after as { status?: string })?.status === 'ACTIVE',
      ),
    ).toBe(true);
  });

  it('invalid pause transitions are refused', async () => {
    const draft = await newCampaign(ids.job, false);
    await expect(cs.transitionCampaign({ campaignId: draft, to: 'PAUSED' })).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
    });
    const id = await newCampaign();
    await cs.transitionCampaign({ campaignId: id, to: 'PAUSED' });
    await expect(cs.transitionCampaign({ campaignId: id, to: 'PAUSED' })).rejects.toMatchObject({
      code: 'CAMPAIGN_ALREADY_IN_STATUS',
    });
    await expect(cs.archiveCampaign({ campaignId: id, reason: 'Tidy up' })).rejects.toMatchObject({
      code: 'CAMPAIGN_ACTIVE',
    });
    await cs.transitionCampaign({ campaignId: id, to: 'COMPLETED' });
    await expect(cs.transitionCampaign({ campaignId: id, to: 'PAUSED' })).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
    });
  });

  it('completing a paused campaign closes its suspended ads', async () => {
    const id = await newCampaign();
    const ad = await newAd(id);
    await cs.transitionCampaign({ campaignId: id, to: 'PAUSED' });
    await cs.transitionCampaign({ campaignId: id, to: 'COMPLETED' });
    expect(await adStatus(ad.id)).toBe('CLOSED');
  });

  it('a paused campaign takes no new prospects, but existing prospects keep moving', async () => {
    const id = await newCampaign();
    const ad = await newAd(id);
    const personId = await seedPerson('paused');
    const p = await ps.createProspect({ advertisementId: ad.id, personId });
    await cs.transitionCampaign({ campaignId: id, to: 'PAUSED' });

    await expect(
      ps.createProspect({ advertisementId: ad.id, personId: await seedPerson('late') }),
    ).rejects.toMatchObject({ code: 'CAMPAIGN_PAUSED' });

    await ps.updateProspectStatus({ prospectId: p.id, status: 'SCREENED' });
    await ps.addProspectNote({ prospectId: p.id, note: 'Spoke while campaign paused' });
    const fu = await ps.setProspectFollowUp({ prospectId: p.id, dueOn: '2030-02-01' });
    expect(fu.dueAt).toBeInstanceOf(Date);
    const r = await ps.convertProspectToCandidate({ prospectId: p.id, confirmed: true });
    expect(r.prospect.status).toBe('CONVERTED_TO_CANDIDATE');
  });

  it('a paused advertisement on an active campaign takes no new prospects', async () => {
    const id = await newCampaign();
    const ad = await newAd(id);
    await cs.upsertAdvertisement({ ...adFields(id, ad.id, 'Ireland'), status: 'PAUSED' });
    await expect(
      ps.createProspect({ advertisementId: ad.id, personId: await seedPerson('adpaused') }),
    ).rejects.toMatchObject({ code: 'AD_PAUSED' });
  });

  it('STAFF cannot pause or resume', async () => {
    const id = await newCampaign();
    session.user.role = 'STAFF';
    await expect(cs.transitionCampaign({ campaignId: id, to: 'PAUSED' })).rejects.toMatchObject({
      code: 'AUTHORIZATION_ERROR',
    });
  });
});
