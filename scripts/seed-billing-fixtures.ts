import { config } from 'dotenv';

config({ path: '.env.local' });

/**
 * Seed a minimal set of billing fixtures so `qa-billing-e2e.spec.ts`
 * has real data to drive:
 *
 *   1. A test Person + Lead so the row-menu "Generate invoice…" flow
 *      is exercisable.
 *   2. Work Permit Application service flipped from payerType=PERSON to
 *      payerType=ANY so the employer detail page can invoice it as a
 *      "price on enquiry" line item (matches the real business case —
 *      an employer often pays a candidate's work permit fee).
 *
 * Idempotent: re-running the script leaves everything untouched.
 */

const FIXTURE_LEAD = {
  firstName: 'E2E',
  lastName: 'Test Lead',
  email: 'e2e-test-lead@ireland-careers.test',
};

async function main() {
  const { and, eq } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const { persons } = await import('../src/lib/db/schema/persons');
  const { leads } = await import('../src/lib/db/schema/leads');
  const { serviceCatalogItems } = await import('../src/lib/db/schema/services');

  let personCreated = false;
  let leadCreated = false;
  let serviceUpdated = false;

  // ── Person + Lead ────────────────────────────────────────────────
  const [existingPerson] = await db
    .select({ id: persons.id })
    .from(persons)
    .where(eq(persons.email, FIXTURE_LEAD.email))
    .limit(1);

  let personId: string;
  if (existingPerson) {
    personId = existingPerson.id;
  } else {
    const [row] = await db
      .insert(persons)
      .values({
        firstName: FIXTURE_LEAD.firstName,
        lastName: FIXTURE_LEAD.lastName,
        email: FIXTURE_LEAD.email,
        source: 'DIRECT',
      })
      .returning({ id: persons.id });
    if (!row) throw new Error('person insert returned no row');
    personId = row.id;
    personCreated = true;
  }

  const [existingLead] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.personId, personId)))
    .limit(1);

  if (!existingLead) {
    await db.insert(leads).values({
      personId,
      status: 'NEW',
    });
    leadCreated = true;
  }

  // ── Employer-payable service ─────────────────────────────────────
  const [workPermit] = await db
    .select({ id: serviceCatalogItems.id, payerType: serviceCatalogItems.payerType })
    .from(serviceCatalogItems)
    .where(eq(serviceCatalogItems.code, 'WORK_PERMIT_APPLICATION'))
    .limit(1);
  if (workPermit && workPermit.payerType !== 'ANY') {
    await db
      .update(serviceCatalogItems)
      .set({ payerType: 'ANY' })
      .where(eq(serviceCatalogItems.id, workPermit.id));
    serviceUpdated = true;
  }

  console.log('\n✓ Billing fixtures seed complete');
  console.log(`  person: ${personCreated ? 'created' : 'already present'} (${FIXTURE_LEAD.email})`);
  console.log(`  lead: ${leadCreated ? 'created' : 'already present'}`);
  console.log(
    `  WORK_PERMIT_APPLICATION: ${
      serviceUpdated ? 'flipped to payerType=ANY' : 'already payerType=ANY (or missing)'
    }`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error('\n✗', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
