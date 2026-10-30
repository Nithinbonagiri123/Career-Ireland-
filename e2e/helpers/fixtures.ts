import { e2eAdminId } from './owner';

/**
 * R6 — deterministic fixtures for browser tests that used to skip when the
 * local database happened to have no matching rows. Each seeds its own
 * uniquely-named rows and returns a cleanup that removes exactly those.
 */
async function mods() {
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: '.env.local' });
  const { eq, inArray, sql } = await import('drizzle-orm');
  const { db } = await import('../../src/lib/db/client');
  const recruitment = await import('../../src/lib/db/schema/recruitment');
  const personsSchema = await import('../../src/lib/db/schema/persons');
  const campaigns = await import('../../src/lib/db/schema/campaigns');
  const io = await import('../../src/lib/db/schema/interviews_offers');
  return { db, eq, inArray, sql, s: { ...recruitment, ...personsSchema, ...campaigns, ...io } };
}

const stamp = () => Math.random().toString(36).slice(2, 7);

export async function seedOpenJob() {
  const m = await mods();
  const tag = stamp();
  const [emp] = await m.db
    .insert(m.s.employers)
    .values({ assignedUserId: await e2eAdminId(), legalName: `Fixture Employer ${tag}` })
    .returning({ id: m.s.employers.id });
  if (!emp) throw new Error('fixture failed');
  const [job] = await m.db
    .insert(m.s.jobRequisitions)
    .values({
      assignedUserId: await e2eAdminId(),
      employerId: emp.id,
      title: `Fixture Job ${tag}`,
      positionsRequired: 1,
      employmentType: 'FULL_TIME',
      status: 'OPEN',
    })
    .returning({ id: m.s.jobRequisitions.id });
  if (!job) throw new Error('fixture failed');
  return {
    jobId: job.id,
    employerId: emp.id,
    title: `Fixture Job ${tag}`,
    cleanup: async () => {
      await m.db.execute(m.sql`DELETE FROM audit_events WHERE entity_id IN (${job.id}, ${emp.id})`);
      await m.db.delete(m.s.jobRequisitions).where(m.eq(m.s.jobRequisitions.id, job.id));
      await m.db.delete(m.s.employers).where(m.eq(m.s.employers.id, emp.id));
    },
  };
}

export async function seedCandidate() {
  const m = await mods();
  const tag = stamp();
  const [p] = await m.db
    .insert(m.s.persons)
    .values({ firstName: 'Fixture', lastName: `Candidate${tag}`, source: 'DIRECT' })
    .returning({ id: m.s.persons.id });
  if (!p) throw new Error('fixture failed');
  await m.db
    .insert(m.s.candidateProfiles)
    .values({ assignedUserId: await e2eAdminId(), personId: p.id });
  return {
    personId: p.id,
    cleanup: async () => {
      await m.db.execute(
        m.sql`DELETE FROM audit_events WHERE entity_id = ${p.id} OR entity_id IN (SELECT id::text FROM candidate_profiles WHERE person_id = ${p.id})`,
      );
      await m.db.delete(m.s.candidateProfiles).where(m.eq(m.s.candidateProfiles.personId, p.id));
      await m.db.delete(m.s.persons).where(m.eq(m.s.persons.id, p.id));
    },
  };
}

export async function seedCampaign() {
  const m = await mods();
  const tag = stamp();
  const [c] = await m.db
    .insert(m.s.recruitmentCampaigns)
    .values({ name: `Fixture Campaign ${tag}`, status: 'DRAFT' })
    .returning({ id: m.s.recruitmentCampaigns.id });
  if (!c) throw new Error('fixture failed');
  return {
    campaignId: c.id,
    name: `Fixture Campaign ${tag}`,
    cleanup: async () => {
      await m.db.execute(m.sql`DELETE FROM audit_events WHERE entity_id = ${c.id}`);
      await m.db.delete(m.s.recruitmentCampaigns).where(m.eq(m.s.recruitmentCampaigns.id, c.id));
    },
  };
}

/**
 * Populated Interviews & offers scenario for one open job. Every row has a
 * fixed name plus a random stamp, dates are relative to now, and cleanup
 * removes exactly the rows created here (by id), so it is safe to run next
 * to other tests and safe to call twice.
 *
 * People are seeded without candidate profiles on purpose: assisted
 * matching only scores profiled candidates, so a matching run in another
 * test can never attach rows to these people and block the cleanup.
 *
 * Job interviews tab: upcoming 1, needs result 1, completed 2,
 * cancelled / no-show 2 (all 6). Offers: open 2, accepted 1, closed 1
 * (all 4). Global /interviews: the 4 people whose application is at the
 * Interview stage.
 */
export async function seedInterviewOfferScenario() {
  const m = await mods();
  const tag = stamp();
  const owner = await e2eAdminId();
  const day = 86_400_000;
  const at = (days: number, hour = 10) => {
    const d = new Date(Date.now() + days * day);
    d.setUTCHours(hour, 0, 0, 0);
    return d;
  };
  const isoDate = (days: number) => at(days).toISOString().slice(0, 10);

  const [emp] = await m.db
    .insert(m.s.employers)
    .values({
      assignedUserId: owner,
      legalName: `Fixture Clinic ${tag}`,
      industry: 'Healthcare',
      city: 'Galway',
      country: 'Ireland',
      relationshipStatus: 'ACTIVE',
    })
    .returning({ id: m.s.employers.id });
  if (!emp) throw new Error('fixture failed');
  const jobTitle = `Fixture Ward Nurse ${tag}`;
  const [job] = await m.db
    .insert(m.s.jobRequisitions)
    .values({
      assignedUserId: owner,
      employerId: emp.id,
      title: jobTitle,
      positionsRequired: 3,
      employmentType: 'FULL_TIME',
      location: 'Galway, Ireland',
      status: 'OPEN',
    })
    .returning({ id: m.s.jobRequisitions.id });
  if (!job) throw new Error('fixture failed');

  const people = [
    { key: 'aoife', first: 'Aoife', last: `Byrne${tag}`, app: 'INTERVIEW' },
    { key: 'conor', first: 'Conor', last: `Walsh${tag}`, app: 'INTERVIEW' },
    { key: 'niamh', first: 'Niamh', last: `Kelly${tag}`, app: 'INTERVIEW' },
    { key: 'ciara', first: 'Ciara', last: `Doyle${tag}`, app: 'INTERVIEW' },
    { key: 'sean', first: 'Sean', last: `Murphy${tag}`, app: 'REJECTED' },
    { key: 'liam', first: 'Liam', last: `Ryan${tag}`, app: 'OFFER' },
    { key: 'orla', first: 'Orla', last: `Quinn${tag}`, app: 'OFFER' },
    { key: 'ruairi', first: 'Ruairi', last: `Burke${tag}`, app: 'OFFER' },
    { key: 'fiona', first: 'Fiona', last: `Nolan${tag}`, app: 'REJECTED' },
  ] as const;
  const personRows = await m.db
    .insert(m.s.persons)
    .values(
      people.map((p) => ({
        firstName: p.first,
        lastName: p.last,
        email: `${p.key}.${tag}@fixture.example.test`,
        source: 'DIRECT' as const,
      })),
    )
    .returning({ id: m.s.persons.id });
  const appRows = await m.db
    .insert(m.s.jobApplications)
    .values(
      people.map((p, i) => ({
        personId: personRows[i]?.id as string,
        jobRequisitionId: job.id,
        status: p.app,
        appliedAt: at(-14 + i),
      })),
    )
    .returning({ id: m.s.jobApplications.id });
  const app = Object.fromEntries(people.map((p, i) => [p.key, appRows[i]?.id as string])) as Record<
    (typeof people)[number]['key'],
    string
  >;

  const interviewRows = await m.db
    .insert(m.s.interviews)
    .values([
      // Aoife: first slot cancelled, second round booked.
      {
        jobApplicationId: app.aoife,
        scheduledAt: at(-2),
        mode: 'VIDEO' as const,
        status: 'CANCELLED' as const,
        location: 'https://meet.example.test/aoife',
        scheduledByUserId: owner,
        notes: 'Candidate asked to move the slot.',
      },
      {
        jobApplicationId: app.aoife,
        scheduledAt: at(2, 14),
        durationMinutes: 45,
        round: 2,
        mode: 'IN_PERSON' as const,
        location: 'Fixture Clinic, Galway',
        interviewerNames: 'Mary Walsh (Director of Nursing)',
        scheduledByUserId: owner,
      },
      // Conor: happened yesterday, waiting for a result.
      {
        jobApplicationId: app.conor,
        scheduledAt: at(-1),
        mode: 'PHONE' as const,
        scheduledByUserId: owner,
      },
      // Niamh: completed, passed.
      {
        jobApplicationId: app.niamh,
        scheduledAt: at(-3),
        mode: 'VIDEO' as const,
        status: 'COMPLETED' as const,
        outcome: 'PASS' as const,
        location: 'https://meet.example.test/niamh',
        scheduledByUserId: owner,
        notes: 'Strong clinical judgement; ready for an offer.',
      },
      // Sean: completed, not successful.
      {
        jobApplicationId: app.sean,
        scheduledAt: at(-5),
        mode: 'PANEL' as const,
        status: 'COMPLETED' as const,
        outcome: 'FAIL' as const,
        scheduledByUserId: owner,
        notes: 'Not enough ward experience for this role.',
      },
      // Ciara: did not attend.
      {
        jobApplicationId: app.ciara,
        scheduledAt: at(-4),
        mode: 'VIDEO' as const,
        status: 'NO_SHOW' as const,
        scheduledByUserId: owner,
      },
    ])
    .returning({ id: m.s.interviews.id });

  const offerRows = await m.db
    .insert(m.s.offers)
    .values([
      {
        jobApplicationId: app.liam,
        amount: '38500',
        currencyCode: 'EUR',
        period: 'ANNUAL' as const,
        startDate: isoDate(30),
        createdByUserId: owner,
      },
      {
        jobApplicationId: app.orla,
        amount: '41000',
        currencyCode: 'EUR',
        period: 'ANNUAL' as const,
        startDate: isoDate(21),
        expiresOn: isoDate(5),
        sentAt: at(-1),
        status: 'SENT' as const,
        createdByUserId: owner,
      },
      {
        jobApplicationId: app.ruairi,
        amount: '40000',
        currencyCode: 'EUR',
        period: 'ANNUAL' as const,
        startDate: isoDate(14),
        sentAt: at(-6),
        respondedAt: at(-2),
        status: 'ACCEPTED' as const,
        createdByUserId: owner,
        terms: 'Night shift allowance included.',
      },
      {
        jobApplicationId: app.fiona,
        amount: '37000',
        currencyCode: 'EUR',
        period: 'ANNUAL' as const,
        sentAt: at(-8),
        respondedAt: at(-6),
        status: 'REJECTED' as const,
        createdByUserId: owner,
        notes: 'Accepted a role closer to home.',
      },
    ])
    .returning({ id: m.s.offers.id });

  const ids = {
    employerId: emp.id,
    jobId: job.id,
    personIds: personRows.map((r) => r.id),
    applicationIds: appRows.map((r) => r.id),
    interviewIds: interviewRows.map((r) => r.id),
    offerIds: offerRows.map((r) => r.id),
  };
  let cleaned = false;
  return {
    ...ids,
    tag,
    jobTitle,
    /** Names of the people whose application is at the Interview stage. */
    interviewStageNames: people
      .filter((p) => p.app === 'INTERVIEW')
      .map((p) => `${p.first} ${p.last}`),
    counts: {
      interviews: { upcoming: 1, overdue: 1, completed: 2, closed: 2, all: 6 },
      offers: { open: 2, accepted: 1, closed: 1, all: 4 },
    },
    cleanup: async () => {
      if (cleaned) return;
      const all = [
        ids.employerId,
        ids.jobId,
        ...ids.personIds,
        ...ids.applicationIds,
        ...ids.interviewIds,
        ...ids.offerIds,
      ];
      await m.db.execute(
        m.sql`DELETE FROM audit_events WHERE entity_id IN (${m.sql.join(
          all.map((id) => m.sql`${id}`),
          m.sql`, `,
        )})`,
      );
      await m.db.delete(m.s.offers).where(m.inArray(m.s.offers.id, ids.offerIds));
      await m.db.delete(m.s.interviews).where(m.inArray(m.s.interviews.id, ids.interviewIds));
      await m.db
        .delete(m.s.jobApplications)
        .where(m.inArray(m.s.jobApplications.id, ids.applicationIds));
      await m.db.delete(m.s.jobRequisitions).where(m.eq(m.s.jobRequisitions.id, ids.jobId));
      await m.db.delete(m.s.persons).where(m.inArray(m.s.persons.id, ids.personIds));
      await m.db.delete(m.s.employers).where(m.eq(m.s.employers.id, ids.employerId));
      cleaned = true;
    },
    /** Read-only: how many seeded rows still exist (0 after cleanup). */
    remaining: async () => {
      const [r] = await m.db.execute<{ n: string }>(m.sql`
        SELECT (
          (SELECT count(*) FROM offers WHERE id IN (${m.sql.join(
            ids.offerIds.map((id) => m.sql`${id}::uuid`),
            m.sql`, `,
          )}))
          + (SELECT count(*) FROM interviews WHERE id IN (${m.sql.join(
            ids.interviewIds.map((id) => m.sql`${id}::uuid`),
            m.sql`, `,
          )}))
          + (SELECT count(*) FROM job_applications WHERE id IN (${m.sql.join(
            ids.applicationIds.map((id) => m.sql`${id}::uuid`),
            m.sql`, `,
          )}))
          + (SELECT count(*) FROM persons WHERE id IN (${m.sql.join(
            ids.personIds.map((id) => m.sql`${id}::uuid`),
            m.sql`, `,
          )}))
          + (SELECT count(*) FROM job_requisitions WHERE id = ${ids.jobId}::uuid)
          + (SELECT count(*) FROM employers WHERE id = ${ids.employerId}::uuid)
        )::text AS n`);
      return Number(r?.n ?? 0);
    },
  };
}
