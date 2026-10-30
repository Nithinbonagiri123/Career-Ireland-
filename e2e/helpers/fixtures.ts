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
  return { db, eq, inArray, sql, s: { ...recruitment, ...personsSchema, ...campaigns } };
}

const stamp = () => Math.random().toString(36).slice(2, 7);

export async function seedOpenJob() {
  const m = await mods();
  const tag = stamp();
  const [emp] = await m.db
    .insert(m.s.employers)
    .values({ legalName: `Fixture Employer ${tag}` })
    .returning({ id: m.s.employers.id });
  if (!emp) throw new Error('fixture failed');
  const [job] = await m.db
    .insert(m.s.jobRequisitions)
    .values({
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
  await m.db.insert(m.s.candidateProfiles).values({ personId: p.id });
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
