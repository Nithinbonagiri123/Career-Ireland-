/**
 * Minimal fixture seed for the E2E suite.
 *
 * The e2e tests assume there's at least one row in each of the main
 * business tables (employer, requisition, candidate, lead) so that
 * list pages, filter chips, and per-row actions actually have data
 * to interact with. Without these, tests like `catalog-inline-create`
 * and `qa-supplement` fail with "element(s) not found" because the
 * page they're testing is empty.
 *
 * Idempotent — matches on a unique field (email for persons, legalName
 * for employers, title for requisitions) and skips if present. Safe to
 * run against a DB that already has real data (the fixture rows are
 * marked with a `e2e-fixture-` prefix so they can be reliably filtered
 * out of downstream reports).
 *
 * Consumed by:
 *   - CI (e2e job, runs after db:seed:e2e-admin)
 *   - Local dev (`pnpm tsx scripts/seed-e2e-minimal.ts`)
 */

import { config } from 'dotenv';

config({ path: '.env.local' });

const FIXTURES = {
  employer: {
    legalName: 'E2E Fixture Employers Ltd',
    industry: 'Software',
    country: 'Ireland',
    city: 'Dublin',
  },
  requisition: {
    title: 'E2E Fixture Junior Engineer',
    location: 'Dublin, Ireland',
  },
  candidates: [
    {
      firstName: 'E2E-Fixture',
      lastName: 'CandidateOne',
      email: 'e2e-fixture-candidate-1@ireland-careers.test',
      currentCity: 'Dublin',
      currentCountry: 'Ireland',
    },
    {
      firstName: 'E2E-Fixture',
      lastName: 'CandidateTwo',
      email: 'e2e-fixture-candidate-2@ireland-careers.test',
      currentCity: 'Cork',
      currentCountry: 'Ireland',
    },
  ],
  lead: {
    firstName: 'E2E-Fixture',
    lastName: 'LeadOne',
    email: 'e2e-fixture-lead-1@ireland-careers.test',
    currentCity: 'Galway',
    currentCountry: 'Ireland',
  },
} as const;

async function main() {
  const { eq } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const { candidateProfiles, persons } = await import('../src/lib/db/schema/persons');
  const { employers, jobRequisitions } = await import('../src/lib/db/schema/recruitment');
  const { leads } = await import('../src/lib/db/schema/leads');
  const { users } = await import('../src/lib/db/schema/users');

  // ── Assigned recruiter — reuse the E2E admin (already seeded) ─────
  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'e2e-admin@ireland-careers.test'))
    .limit(1);
  if (!admin) {
    throw new Error('E2E admin not found — run `pnpm db:seed:e2e-admin` before this script.');
  }

  // ── Employer ──────────────────────────────────────────────────────
  let [employer] = await db
    .select({ id: employers.id })
    .from(employers)
    .where(eq(employers.legalName, FIXTURES.employer.legalName))
    .limit(1);
  if (!employer) {
    [employer] = await db
      .insert(employers)
      .values({
        legalName: FIXTURES.employer.legalName,
        industry: FIXTURES.employer.industry,
        country: FIXTURES.employer.country,
        city: FIXTURES.employer.city,
        relationshipStatus: 'ACTIVE',
        assignedUserId: admin.id,
      })
      .returning({ id: employers.id });
    console.log(`✓ Created employer ${FIXTURES.employer.legalName}`);
  } else {
    console.log(`✓ Employer exists: ${FIXTURES.employer.legalName}`);
  }
  if (!employer) throw new Error('failed to insert employer fixture');

  // ── Requisition ───────────────────────────────────────────────────
  let [requisition] = await db
    .select({ id: jobRequisitions.id })
    .from(jobRequisitions)
    .where(eq(jobRequisitions.title, FIXTURES.requisition.title))
    .limit(1);
  if (!requisition) {
    [requisition] = await db
      .insert(jobRequisitions)
      .values({
        employerId: employer.id,
        title: FIXTURES.requisition.title,
        location: FIXTURES.requisition.location,
        positionsRequired: 2,
        positionsFilled: 0,
        employmentType: 'FULL_TIME',
        status: 'OPEN',
        assignedUserId: admin.id,
      })
      .returning({ id: jobRequisitions.id });
    console.log(`✓ Created requisition ${FIXTURES.requisition.title}`);
  } else {
    console.log(`✓ Requisition exists: ${FIXTURES.requisition.title}`);
  }
  if (!requisition) throw new Error('failed to insert requisition fixture');

  // ── Candidates ────────────────────────────────────────────────────
  for (const c of FIXTURES.candidates) {
    const [existingPerson] = await db
      .select({ id: persons.id })
      .from(persons)
      .where(eq(persons.email, c.email))
      .limit(1);
    let personId = existingPerson?.id;
    if (!personId) {
      const [created] = await db
        .insert(persons)
        .values({
          firstName: c.firstName,
          lastName: c.lastName,
          email: c.email,
          normalizedEmail: c.email.toLowerCase(),
          currentCity: c.currentCity,
          currentCountry: c.currentCountry,
          source: 'DIRECT',
        })
        .returning({ id: persons.id });
      if (!created) throw new Error(`failed to insert person ${c.email}`);
      personId = created.id;
      console.log(`✓ Created person ${c.email}`);
    }
    const [profile] = await db
      .select({ id: candidateProfiles.id })
      .from(candidateProfiles)
      .where(eq(candidateProfiles.personId, personId))
      .limit(1);
    if (!profile) {
      await db.insert(candidateProfiles).values({
        personId,
        lifecycleStatus: 'ACTIVE',
        availabilityStatus: 'AVAILABLE',
        assignedUserId: admin.id,
      });
      console.log(`  ↳ candidate profile for ${c.email}`);
    }
  }

  // ── Lead ──────────────────────────────────────────────────────────
  const [existingLeadPerson] = await db
    .select({ id: persons.id })
    .from(persons)
    .where(eq(persons.email, FIXTURES.lead.email))
    .limit(1);
  let leadPersonId = existingLeadPerson?.id;
  if (!leadPersonId) {
    const [created] = await db
      .insert(persons)
      .values({
        firstName: FIXTURES.lead.firstName,
        lastName: FIXTURES.lead.lastName,
        email: FIXTURES.lead.email,
        normalizedEmail: FIXTURES.lead.email.toLowerCase(),
        currentCity: FIXTURES.lead.currentCity,
        currentCountry: FIXTURES.lead.currentCountry,
        source: 'DIRECT',
      })
      .returning({ id: persons.id });
    if (!created) throw new Error('failed to insert lead person');
    leadPersonId = created.id;
    console.log(`✓ Created lead person ${FIXTURES.lead.email}`);
  }
  const [existingLead] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(eq(leads.personId, leadPersonId))
    .limit(1);
  if (!existingLead) {
    await db.insert(leads).values({
      personId: leadPersonId,
      status: 'NEW',
      assignedUserId: admin.id,
    });
    console.log(`✓ Created lead`);
  } else {
    console.log(`✓ Lead exists`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('✗ seed-e2e-minimal failed:', err);
  process.exit(1);
});
