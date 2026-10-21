import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Stage 6G — visual redesign of the Candidate Workspace to match the
 * supplied reference image. Seeds a realistic healthcare candidate
 * with:
 *   - two paid services (one fully paid, one awaiting payment)
 *   - skills, qualifications, employment history, education entries
 *   - populated personal + contact details
 * then captures desktop (1440×900), tablet (820×1180) and mobile
 * (390×844) screenshots of each major surface so the user can compare
 * side-by-side with the reference.
 *
 * The reference tested against is a reference-only PNG; the test does
 * NOT compare pixels. It asserts the structural anchors are present
 * (hero, service billing header, tab bar, Overview grid) and records
 * the screenshots for human review.
 */

const SHOTS_DIR = path.resolve('playwright/stage6g');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

async function dbModules() {
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: '.env.local' });
  const { eq, and, inArray } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const persons = await import('../src/lib/db/schema/persons');
  const leads = await import('../src/lib/db/schema/leads');
  const commerce = await import('../src/lib/db/schema/commerce');
  const billing = await import('../src/lib/db/schema/billing');
  const proformas = await import('../src/lib/db/schema/proformas');
  const servicesSchema = await import('../src/lib/db/schema/services');
  const users = await import('../src/lib/db/schema/users');
  const candidateDetails = await import('../src/lib/db/schema/candidate_details');
  const reference = await import('../src/lib/db/schema/reference');
  const occupationsSchema = await import('../src/lib/db/schema/occupations');
  return {
    db,
    eq,
    and,
    inArray,
    schemas: {
      ...persons,
      ...leads,
      ...commerce,
      ...billing,
      ...proformas,
      ...servicesSchema,
      ...users,
      ...candidateDetails,
      ...reference,
      ...occupationsSchema,
    },
  };
}

async function fillPayViaUI(
  page: import('@playwright/test').Page,
  leadId: string,
  pfId: string,
  amount: string,
) {
  await page.goto(`/leads/${leadId}/pro-formas/${pfId}`);
  await page.getByRole('button', { name: /Record payment/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await dialog.getByLabel(/Amount/i).fill(amount);
  await dialog.getByRole('button', { name: /Record payment/i }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await page
    .getByRole('button', { name: /^Verify$/ })
    .first()
    .click();
  await expect(page.getByText(/Payment verified/i).first()).toBeVisible({ timeout: 15_000 });
}

test('stage 6G — realistic healthcare candidate rendered in the redesigned workspace', async ({
  page,
}) => {
  const stamp = Math.random().toString(36).slice(2, 6);
  const m = await dbModules();

  const [admin] = await m.db
    .select({ id: m.schemas.users.id })
    .from(m.schemas.users)
    .where(m.eq(m.schemas.users.email, 'e2e-admin@ireland-careers.test'))
    .limit(1);
  if (!admin) throw new Error('e2e admin user missing');
  const [svc] = await m.db
    .select({ id: m.schemas.serviceCatalogItems.id, name: m.schemas.serviceCatalogItems.name })
    .from(m.schemas.serviceCatalogItems)
    .where(
      m.and(
        m.eq(m.schemas.serviceCatalogItems.isActive, true),
        m.eq(m.schemas.serviceCatalogItems.payerType, 'PERSON'),
      ),
    )
    .limit(1);
  if (!svc) throw new Error('no active service in test DB');

  // Realistic healthcare profile mirroring the reference image.
  const [person] = await m.db
    .insert(m.schemas.persons)
    .values({
      firstName: 'Lerato',
      lastName: `Mokoena-${stamp}`,
      middleName: 'Thabang',
      email: `lerato-${stamp}@example.test`,
      phone: '+27824567890',
      dateOfBirth: '1988-03-14',
      nationality: 'South African',
      currentCountry: 'South Africa',
      currentCity: 'Cape Town',
      addressLine1: '12 Long Street',
      addressLine2: 'Cape Town 8001',
      source: 'DIRECT',
      irishImmigrationStatus: 'NONE',
    })
    .returning({ id: m.schemas.persons.id });
  if (!person) throw new Error('person seed failed');
  const personId = person.id;

  // Candidate profile with professional summary + occupation.
  const [occ] = await m.db
    .select({ id: m.schemas.occupations.id })
    .from(m.schemas.occupations)
    .limit(1);
  const [profile] = await m.db
    .insert(m.schemas.candidateProfiles)
    .values({
      personId,
      primaryOccupationId: occ?.id,
      yearsOfExperience: '12',
      workEligibility: 'Awaiting Irish permit',
      preferredLocation: 'Dublin, Cork or remote',
      profileSummary:
        'Experienced registered nurse with 12 years of clinical practice across general and surgical wards. Seeking relocation to Ireland to join an acute-care team.',
    })
    .returning({ id: m.schemas.candidateProfiles.id });
  if (!profile) throw new Error('profile seed failed');

  // Seed skills via custom name (no catalog dependency).
  const skillNames = [
    'Patient Care',
    'Clinical Assessment',
    'Medication Administration',
    'Team Collaboration',
    'Medical Documentation',
  ];
  for (const name of skillNames) {
    await m.db.insert(m.schemas.candidateSkills).values({
      personId,
      customName: name,
      proficiency: 'ADVANCED',
      yearsExperience: 8,
    });
  }

  // Seed qualifications/certifications (free-text custom).
  await m.db.insert(m.schemas.candidateQualifications).values({
    personId,
    customName: 'South African Nursing Council (SANC) · Registered Nurse',
    institution: 'South African Nursing Council',
    awardedOn: '2010-08-01',
  });
  await m.db.insert(m.schemas.candidateQualifications).values({
    personId,
    customName: 'Basic Life Support (BLS)',
    institution: 'Red Cross South Africa',
    awardedOn: '2024-06-10',
  });

  // Employment history — two roles.
  await m.db.insert(m.schemas.employmentHistory).values({
    personId,
    employerName: 'Mediclinic Cape Town',
    jobTitle: 'Registered Nurse',
    location: 'Cape Town',
    startDate: '2016-01-01',
    isCurrent: true,
    description: 'Medical-surgical unit, patient care, clinical assessment and support.',
  });
  await m.db.insert(m.schemas.employmentHistory).values({
    personId,
    employerName: 'Netcare',
    jobTitle: 'Enrolled Nurse',
    location: 'Johannesburg',
    startDate: '2010-06-01',
    endDate: '2015-12-31',
    isCurrent: false,
    description: 'General ward nursing, medication administration, patient support.',
  });

  // Education.
  await m.db.insert(m.schemas.educationEntries).values({
    personId,
    institution: 'University of Cape Town',
    degree: 'Bachelor of Nursing',
    fieldOfStudy: 'Nursing',
    startDate: '2006-02-01',
    endDate: '2010-11-30',
  });

  // Seed two services to drive the two-row Service billing section.
  type SeedPf = { leadId: string; pfId: string; amount: string; name: string };
  const seedPfs: SeedPf[] = [];
  const services: Array<{ amount: string; name: string }> = [
    { amount: '300.00', name: 'CV & Cover Letter' },
    { amount: '500.00', name: 'Job Search Support' },
  ];
  for (let i = 0; i < services.length; i++) {
    const sInfo = services[i];
    if (!sInfo) continue;
    const [lead] = await m.db
      .insert(m.schemas.leads)
      .values({
        personId,
        targetBusiness: 'CANDIDATE_SERVICES',
        serviceOfInterestId: svc.id,
        status: 'AWAITING_PAYMENT',
      })
      .returning({ id: m.schemas.leads.id });
    if (!lead) throw new Error('lead seed failed');
    const pfNumber = `PF-${stamp}-${i}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
    const [pf] = await m.db
      .insert(m.schemas.proFormaInvoices)
      .values({
        number: pfNumber,
        sourceLeadId: lead.id,
        payerPersonId: personId,
        currencyCode: 'EUR',
        subtotal: sInfo.amount,
        status: 'ACCEPTED',
        issuedAt: new Date(Date.now() - (10 - i * 2) * 86_400_000),
        acceptedAt: new Date(Date.now() - (8 - i * 2) * 86_400_000),
        acceptedByUserId: admin.id,
        createdByUserId: admin.id,
      })
      .returning({ id: m.schemas.proFormaInvoices.id });
    if (!pf) throw new Error('pf seed failed');
    await m.db.insert(m.schemas.proFormaLineItems).values({
      proFormaInvoiceId: pf.id,
      serviceCatalogItemId: svc.id,
      description: sInfo.name,
      quantity: '1',
      unitPrice: sInfo.amount,
      lineSubtotal: sInfo.amount,
      sortOrder: 0,
    });
    seedPfs.push({ leadId: lead.id, pfId: pf.id, amount: sInfo.amount, name: sInfo.name });
  }

  try {
    // First service: fully paid.
    const first = seedPfs[0];
    if (first) await fillPayViaUI(page, first.leadId, first.pfId, first.amount);
    // Second service: partial payment (40% of agreed) → "Awaiting payment".
    const second = seedPfs[1];
    if (second) {
      const partial = (Number.parseFloat(second.amount) * 0.4).toFixed(2);
      await page.goto(`/leads/${second.leadId}/pro-formas/${second.pfId}`);
      await page.getByRole('button', { name: /Record payment/i }).click();
      const dlg = page.getByRole('dialog');
      await expect(dlg).toBeVisible({ timeout: 10_000 });
      await dlg.getByLabel(/Amount/i).fill(partial);
      await dlg.getByRole('button', { name: /Record payment/i }).click();
      await expect(dlg).toBeHidden({ timeout: 10_000 });
      await page
        .getByRole('button', { name: /^Verify$/ })
        .first()
        .click();
      await expect(page.getByText(/Payment verified/i).first()).toBeVisible({ timeout: 15_000 });
    }

    // ── Desktop ───────────────────────────────────────────────────
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/clients/${personId}`);
    await expect(
      page.getByRole('heading', { name: new RegExp(`Mokoena-${stamp}`, 'i') }),
    ).toBeVisible({ timeout: 15_000 });
    // Hero chips.
    // Stage B Wave 3 — live engagement → derived "In progress" chip.
    await expect(page.getByText(/In progress/i).first()).toBeVisible();
    await expect(page.getByText(/South African/).first()).toBeVisible();
    // Overview shows the Service billing summary; the detailed
    // engagement cards live in the Services & Billing tab (Stage 6G).
    await expect(page.getByText('Service billing').first()).toBeVisible();
    await page.goto(`/clients/${personId}?tab=billing`);
    await expect(page.locator('[data-testid="engagement-card"]')).toHaveCount(2, {
      timeout: 10_000,
    });
    await expect(page.getByText(/Fully paid/i).first()).toBeVisible();
    await expect(page.getByText(/Awaiting payment/i).first()).toBeVisible();
    await page.goto(`/clients/${personId}`);
    // Tab bar: Overview + Profile + Documents & CV + Applications + Activity.
    await expect(page.getByRole('tab', { name: /Overview/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /^Profile$/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Documents & CV/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Applications/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Activity/i })).toBeVisible();
    // Overview grid cards.
    await expect(page.getByText('Personal details').first()).toBeVisible();
    await expect(page.getByText('Professional profile').first()).toBeVisible();
    await expect(page.getByText('Employment history').first()).toBeVisible();
    await expect(page.getByText(/Education & qualifications/i).first()).toBeVisible();
    await expect(page.getByText(/Certifications & licences/i).first()).toBeVisible();
    await page.screenshot({
      path: path.join(SHOTS_DIR, `desktop-${stamp}.png`),
      fullPage: true,
    });

    // ── Tablet ────────────────────────────────────────────────────
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.goto(`/clients/${personId}`);
    await expect(page.getByText('Service billing').first()).toBeVisible({ timeout: 15_000 });
    await page.screenshot({
      path: path.join(SHOTS_DIR, `tablet-${stamp}.png`),
      fullPage: true,
    });

    // ── Mobile ────────────────────────────────────────────────────
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/clients/${personId}`);
    await expect(page.getByText('Service billing').first()).toBeVisible({ timeout: 15_000 });
    await page.screenshot({
      path: path.join(SHOTS_DIR, `mobile-${stamp}.png`),
      fullPage: true,
    });
  } finally {
    const { eq, schemas, db } = m;
    const engs = await db
      .select({ id: schemas.serviceEngagements.id })
      .from(schemas.serviceEngagements)
      .where(eq(schemas.serviceEngagements.beneficiaryPersonId, personId));
    const engIds = engs.map((e) => e.id);
    if (engIds.length > 0) {
      const invs = await db
        .select({ id: schemas.invoices.id })
        .from(schemas.invoices)
        .where(m.inArray(schemas.invoices.serviceEngagementId, engIds));
      const invIds = invs.map((i) => i.id);
      const pays = await db
        .select({ id: schemas.payments.id })
        .from(schemas.payments)
        .where(m.inArray(schemas.payments.serviceEngagementId, engIds));
      const payIds = pays.map((p) => p.id);
      if (payIds.length > 0)
        await db.delete(schemas.receipts).where(m.inArray(schemas.receipts.paymentId, payIds));
      if (invIds.length > 0) {
        await db
          .delete(schemas.invoiceLineItems)
          .where(m.inArray(schemas.invoiceLineItems.invoiceId, invIds));
        await db
          .delete(schemas.proFormaOfficialInvoices)
          .where(m.inArray(schemas.proFormaOfficialInvoices.invoiceId, invIds));
        await db.delete(schemas.invoices).where(m.inArray(schemas.invoices.id, invIds));
      }
      await db
        .delete(schemas.payments)
        .where(m.inArray(schemas.payments.serviceEngagementId, engIds));
      await db
        .delete(schemas.serviceEngagements)
        .where(m.inArray(schemas.serviceEngagements.id, engIds));
    }
    for (const sp of seedPfs) {
      await db
        .delete(schemas.proFormaLineItems)
        .where(eq(schemas.proFormaLineItems.proFormaInvoiceId, sp.pfId));
      await db.delete(schemas.proFormaInvoices).where(eq(schemas.proFormaInvoices.id, sp.pfId));
    }
    await db.delete(schemas.candidateSkills).where(eq(schemas.candidateSkills.personId, personId));
    await db
      .delete(schemas.candidateQualifications)
      .where(eq(schemas.candidateQualifications.personId, personId));
    await db
      .delete(schemas.employmentHistory)
      .where(eq(schemas.employmentHistory.personId, personId));
    await db
      .delete(schemas.educationEntries)
      .where(eq(schemas.educationEntries.personId, personId));
    await db.delete(schemas.leads).where(eq(schemas.leads.personId, personId));
    await db
      .delete(schemas.candidateProfiles)
      .where(eq(schemas.candidateProfiles.personId, personId));
    await db.delete(schemas.persons).where(eq(schemas.persons.id, personId));
  }
});
