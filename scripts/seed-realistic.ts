import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';

// Load env BEFORE importing anything that reads process.env at import time.
config({ path: '.env.local' });

/**
 * Wipe + reseed the DB with realistic demo data.
 *
 * Preserves:
 *   - All staff users (users table minus role IN ('CANDIDATE','EMPLOYER'))
 *   - Lookup tables: occupations, skills, qualifications, currencies,
 *     document_types, service_catalog_items, service_packages,
 *     document_requirement_rules
 *   - HR data (staff_profiles, attendance_sessions)
 *   - Auth infrastructure (password_reset_tokens, login_attempts)
 *
 * Wipes:
 *   - persons, candidate_profiles, leads
 *   - employers + contacts + requisitions + applications/shortlists/matches/placements
 *   - campaigns/ads/prospects
 *   - service_engagements/invoices/receipts/payments
 *   - documents + candidate skills/qualifications
 *   - immigration cases
 *   - communications, tasks, notifications
 *   - audit_events (would otherwise dangle referencing deleted entities)
 *   - portal_invitations
 *
 * Then seeds:
 *   - 100 candidates with diverse names (Irish + international), realistic
 *     contact details, primary occupation, city, availability, and a
 *     payment + invoice + receipt so they're fully-formed.
 *   - 8 employers across mixed industries with 1 contact each.
 *   - ~15 requisitions distributed across employers with realistic titles
 *     matched to real occupations from the DB.
 *
 * Idempotent — safe to run repeatedly. Uses stable pseudo-random data
 * seeded on candidate index so a re-run overwrites cleanly.
 *
 *   Usage:  pnpm tsx scripts/seed-realistic.ts
 */

async function main() {
  // Deferred imports so dotenv has populated process.env first.
  const { and, eq, inArray, sql } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const { persons, candidateProfiles } = await import('../src/lib/db/schema/persons');
  const { occupations, occupationCategories } = await import('../src/lib/db/schema/occupations');
  const { skills, qualifications } = await import('../src/lib/db/schema/reference');
  const { candidateSkills, candidateQualifications } = await import(
    '../src/lib/db/schema/candidate_details'
  );
  const { employers, employerContacts, jobRequisitions, requisitionSkills } = await import(
    '../src/lib/db/schema/recruitment'
  );
  const { serviceEngagements, payments } = await import('../src/lib/db/schema/commerce');
  const { invoices, receipts } = await import('../src/lib/db/schema/billing');
  const { serviceCatalogItems } = await import('../src/lib/db/schema/services');
  const { currencies } = await import('../src/lib/db/schema/currencies');
  const { users } = await import('../src/lib/db/schema/users');

  console.log('▶ Verifying we have a preserved staff admin before wipe…');
  const staffCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(
      inArray(users.role, [
        'ADMIN',
        'STAFF',
        'MANAGER',
        'RECRUITER',
        'DOCUMENT_SPECIALIST',
        'FINANCE',
      ]),
    );
  if ((staffCount[0]?.count ?? 0) === 0) {
    throw new Error(
      'No staff users found — refusing to wipe. Seed a staff admin first via pnpm db:seed:admin.',
    );
  }
  console.log(`  ${staffCount[0]?.count} staff user(s) present — safe to proceed.`);

  console.log('▶ Wiping demo data (staff + lookups preserved)…');
  await db.transaction(async (tx) => {
    // Order matters — children before parents. Bare `sql` avoids drizzle's
    // where-clause overhead for full-table deletes.
    const deleteInOrder = [
      // Audit trail dangles otherwise
      'audit_events',
      // Activities / notifications
      'notifications',
      'tasks',
      'communication_logs',
      // Interviews & offers hang off applications
      'offers',
      'interviews',
      // Recruitment funnel
      'placements',
      'job_applications',
      'shortlist_entries',
      'candidate_matches',
      'requisition_skills',
      'requisition_qualifications',
      'job_requisitions',
      'employer_contacts',
      'employers',
      // Campaigns
      'recruitment_prospects',
      'advertisements',
      'recruitment_campaigns',
      // Documents
      'document_requirement_fulfillments',
      'candidate_document_requirements',
      'immigration_case_documents',
      'immigration_case_document_requirements',
      'immigration_cases',
      'document_instances',
      // Candidate details
      'candidate_skills',
      'candidate_qualifications',
      'employment_history',
      'candidate_email_accounts',
      // Commerce / billing
      'receipts',
      'payments',
      'invoices',
      'service_engagements',
      // Portal + leads
      'portal_invitations',
      'leads',
      // Roles
      'candidate_profiles',
      'persons',
    ];
    for (const t of deleteInOrder) {
      await tx.execute(sql.raw(`DELETE FROM "${t}"`));
    }
    // Kill portal users (staff kept).
    await tx.execute(sql`DELETE FROM users WHERE role IN ('CANDIDATE', 'EMPLOYER')`);
  });
  console.log('  ✓ Wipe complete.');

  // ─── Lookup fetch + optional seed of the small essentials ────────────
  console.log('▶ Ensuring lookup tables have enough breadth…');

  // Ensure at least one occupation category exists — occupations FK to it.
  const [existingCategory] = await db.select().from(occupationCategories).limit(1);
  let generalCategoryId: string;
  if (existingCategory) {
    generalCategoryId = existingCategory.id;
  } else {
    const [created] = await db
      .insert(occupationCategories)
      .values({ name: 'General', isActive: true })
      .returning({ id: occupationCategories.id });
    if (!created) throw new Error('failed to create General occupation category');
    generalCategoryId = created.id;
    console.log('  + General occupation category created');
  }

  const currentOccupations = await db.select().from(occupations);
  const OCC_SEED = [
    'Plumber',
    'Electrician',
    'Chef',
    'Registered Nurse',
    'Care Worker',
    'HGV Driver',
    'Software Engineer',
    'Data Analyst',
    'Warehouse Operative',
    'Construction Worker',
    'Hotel Manager',
    'Waiter / Waitress',
    'Accountant',
    'Sales Representative',
    'Mechanic',
    'Teacher',
    'Civil Engineer',
    'Welder',
  ];
  const existingOccNames = new Set(currentOccupations.map((o) => o.name.toLowerCase()));
  const occToInsert = OCC_SEED.filter((n) => !existingOccNames.has(n.toLowerCase())).map((n) => ({
    id: randomUUID(),
    name: n,
    categoryId: generalCategoryId,
    isActive: true,
  }));
  if (occToInsert.length > 0) {
    await db.insert(occupations).values(occToInsert);
    console.log(`  + ${occToInsert.length} occupations seeded`);
  }

  const currentSkills = await db.select().from(skills);
  const SKILL_SEED = [
    'Plumbing',
    'Electrical Wiring',
    'Cooking',
    'Patient Care',
    'HGV Class C',
    'JavaScript',
    'TypeScript',
    'React',
    'Node.js',
    'SQL',
    'Excel',
    'Customer Service',
    'MIG Welding',
    'Forklift Operation',
    'First Aid',
    'Team Leadership',
  ];
  const existingSkillNames = new Set(currentSkills.map((s) => s.name.toLowerCase()));
  const skillsToInsert = SKILL_SEED.filter((n) => !existingSkillNames.has(n.toLowerCase())).map(
    (n) => ({ id: randomUUID(), name: n, isActive: true }),
  );
  if (skillsToInsert.length > 0) {
    await db.insert(skills).values(skillsToInsert);
    console.log(`  + ${skillsToInsert.length} skills seeded`);
  }

  const currentQuals = await db.select().from(qualifications);
  const QUAL_SEED = [
    'Level 6 Craft Certificate (Plumbing)',
    'Level 6 Craft Certificate (Electrical)',
    'BSc Computer Science',
    'Registered General Nurse (NMBI)',
    'HGV Class C Licence',
    'Safe Pass',
    'HACCP Level 2',
    'City & Guilds Culinary Arts',
    'Chartered Accountant',
  ];
  const existingQualNames = new Set(currentQuals.map((q) => q.name.toLowerCase()));
  const qualsToInsert = QUAL_SEED.filter((n) => !existingQualNames.has(n.toLowerCase())).map(
    (n) => ({ id: randomUUID(), name: n, isActive: true }),
  );
  if (qualsToInsert.length > 0) {
    await db.insert(qualifications).values(qualsToInsert);
    console.log(`  + ${qualsToInsert.length} qualifications seeded`);
  }

  // Refetch after any inserts.
  const allOccupations = await db.select().from(occupations).where(eq(occupations.isActive, true));
  const allSkills = await db.select().from(skills).where(eq(skills.isActive, true));
  const allQuals = await db.select().from(qualifications).where(eq(qualifications.isActive, true));

  // Ensure at least one currency + service catalog item exist.
  const allCurrencies = await db.select().from(currencies).where(eq(currencies.isActive, true));
  if (allCurrencies.length === 0) {
    throw new Error(
      'No currencies configured — seed at least EUR before running this. Try pnpm db:seed:currencies.',
    );
  }
  const eurRow = allCurrencies.find((c) => c.code === 'EUR') ?? allCurrencies[0]!;

  const [existingCatalog] = await db
    .select()
    .from(serviceCatalogItems)
    .where(eq(serviceCatalogItems.code, 'CANDIDATE_ONBOARDING'))
    .limit(1);
  let onboardingCatalogId: string;
  if (existingCatalog) {
    onboardingCatalogId = existingCatalog.id;
  } else {
    const [created] = await db
      .insert(serviceCatalogItems)
      .values({
        code: 'CANDIDATE_ONBOARDING',
        name: 'Candidate Onboarding',
        defaultCurrencyCode: eurRow.code,
        payerType: 'PERSON',
      })
      .returning({ id: serviceCatalogItems.id });
    if (!created) throw new Error('failed to bootstrap CANDIDATE_ONBOARDING catalog item');
    onboardingCatalogId = created.id;
  }

  // Grab a staff user to attribute assignments/audit to.
  const [staffUser] = await db
    .select()
    .from(users)
    .where(inArray(users.role, ['ADMIN', 'STAFF', 'MANAGER', 'RECRUITER']))
    .limit(1);
  if (!staffUser) throw new Error('no staff user available — cannot attribute records');

  // ─── Name / city pools for realistic diversity ──────────────────────

  const IRISH_FIRST = [
    'Aoife',
    'Cillian',
    'Niamh',
    'Sean',
    'Ciara',
    'Oisin',
    'Saoirse',
    'Padraig',
    'Roisin',
    'Eoin',
    'Sinead',
    'Fionn',
    'Aisling',
    'Ronan',
    'Mairead',
  ];
  const IRISH_LAST = [
    "O'Sullivan",
    'Murphy',
    'Kelly',
    'Byrne',
    'Ryan',
    "O'Brien",
    'Walsh',
    'McCarthy',
    'Doyle',
    'Kennedy',
    'Lynch',
    'Gallagher',
    'Fitzgerald',
  ];
  const INTL_FIRST = [
    'Priya',
    'Rohan',
    'Aarav',
    'Ananya',
    'Vikram',
    'Sneha',
    'Thabo',
    'Nomvula',
    'Sipho',
    'Palesa',
    'Lerato',
    'Kagiso',
    'Wei',
    'Ming',
    'Mateusz',
    'Agnieszka',
    'Karol',
    'Anna',
    'Jose',
    'Maria',
    'Miguel',
    'Sofia',
    'Andrei',
    'Elena',
    'Fatima',
    'Ahmed',
    'Zainab',
    'Omar',
  ];
  const INTL_LAST = [
    'Sharma',
    'Patel',
    'Reddy',
    'Bonagiri',
    'Naidoo',
    'Mokoena',
    'Ndlovu',
    'Dlamini',
    'Zhang',
    'Lin',
    'Kowalski',
    'Nowak',
    'Silva',
    'Garcia',
    'Popescu',
    'Al-Rashid',
    'Hassan',
    'Okafor',
  ];
  const IE_CITIES = [
    'Dublin',
    'Cork',
    'Galway',
    'Limerick',
    'Waterford',
    'Kilkenny',
    'Sligo',
    'Drogheda',
    'Dundalk',
    'Athlone',
    'Ennis',
  ];
  const SA_CITIES = ['Johannesburg', 'Cape Town', 'Durban', 'Pretoria', 'Port Elizabeth'];

  const NATIONALITIES = [
    'Irish',
    'Indian',
    'South African',
    'Nigerian',
    'Polish',
    'Portuguese',
    'Romanian',
    'Filipino',
    'Chinese',
    'Brazilian',
  ];

  const LIFECYCLE: Array<'ACTIVE' | 'INACTIVE' | 'ARCHIVED'> = [
    'ACTIVE',
    'ACTIVE',
    'ACTIVE',
    'ACTIVE',
    'ACTIVE',
    'INACTIVE',
    'ARCHIVED',
  ];
  const AVAILABILITY: Array<'AVAILABLE' | 'TEMPORARILY_UNAVAILABLE' | 'PLACED'> = [
    'AVAILABLE',
    'AVAILABLE',
    'AVAILABLE',
    'AVAILABLE',
    'TEMPORARILY_UNAVAILABLE',
    'PLACED',
  ];

  const pick = <T>(arr: T[], i: number): T => arr[i % arr.length] as T;
  const pickRandom = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)] as T;

  // ─── 100 candidates ─────────────────────────────────────────────────

  console.log('▶ Seeding 100 candidates…');
  const seedRunAt = new Date();
  const suffix = seedRunAt.getTime().toString(36).slice(-4);

  const candidateResults: Array<{
    personId: string;
    profileId: string;
    firstName: string;
    lastName: string;
    amountEUR: string;
  }> = [];

  for (let i = 0; i < 100; i++) {
    const useIrishName = i % 3 === 0; // ~1/3 Irish, 2/3 international
    const firstName = useIrishName ? pick(IRISH_FIRST, i) : pick(INTL_FIRST, i);
    const lastName = useIrishName ? pick(IRISH_LAST, i) : pick(INTL_LAST, i);
    const useIECity = i % 4 !== 0;
    const currentCity = useIECity ? pick(IE_CITIES, i) : pick(SA_CITIES, i);
    const currentCountry = useIECity ? 'Ireland' : 'South Africa';
    const nationality = useIrishName ? 'Irish' : pick(NATIONALITIES, i);
    const email = `${firstName.toLowerCase().replace(/[^a-z]/g, '')}.${lastName
      .toLowerCase()
      .replace(/[^a-z]/g, '')}${i}${suffix}@example.test`;
    const phone = `+3538${3 + (i % 6)}${String(1_000_000 + i).padStart(7, '0')}`;
    // DOB somewhere between 22 and 55 years old
    const age = 22 + (i % 34);
    const dobDate = new Date(seedRunAt);
    dobDate.setFullYear(dobDate.getFullYear() - age);
    dobDate.setMonth((i * 7) % 12);
    dobDate.setDate(1 + ((i * 13) % 27));
    const dob = dobDate.toISOString().slice(0, 10);

    const [person] = await db
      .insert(persons)
      .values({
        firstName,
        lastName,
        dateOfBirth: dob,
        nationality,
        email,
        normalizedEmail: email.toLowerCase(),
        phone,
        normalizedPhone: phone.replace(/[^0-9+]/g, ''),
        currentCity,
        currentCountry,
        source: pick(
          ['DIRECT', 'REFERRAL', 'ADVERTISEMENT', 'EMPLOYER_REFERRAL', 'OTHER'] as const,
          i,
        ),
        notes: `${firstName} ${lastName} — ${age} years old, based in ${currentCity}. Interested in roles matching their occupation.`,
        isDraft: false,
      })
      .returning();
    if (!person) throw new Error(`person insert failed at i=${i}`);

    const occupation = pick(allOccupations, i);
    const [profile] = await db
      .insert(candidateProfiles)
      .values({
        personId: person.id,
        primaryOccupationId: occupation.id,
        yearsOfExperience: String(1 + (i % 20)),
        workEligibility: currentCountry === 'Ireland' ? 'EU citizen' : 'Requires work permit',
        preferredLocation: pick(IE_CITIES, i + 1),
        profileSummary: person.notes,
        lifecycleStatus: pick(LIFECYCLE, i),
        availabilityStatus: pick(AVAILABILITY, i),
        assignedUserId: staffUser.id,
      })
      .returning();
    if (!profile) throw new Error(`profile insert failed at i=${i}`);

    // 2-3 skills per candidate.
    const skillPicks = [pick(allSkills, i), pick(allSkills, i + 3), pick(allSkills, i + 7)];
    const uniqSkills = Array.from(new Map(skillPicks.map((s) => [s.id, s])).values());
    for (const s of uniqSkills) {
      await db
        .insert(candidateSkills)
        .values({ personId: person.id, skillId: s.id })
        .onConflictDoNothing();
    }

    // 1 qualification per candidate.
    const qualPick = pick(allQuals, i);
    await db
      .insert(candidateQualifications)
      .values({ personId: person.id, qualificationId: qualPick.id })
      .onConflictDoNothing();

    // Payment engine — everyone paid €300 onboarding for demo simplicity.
    const amountEUR = '300.00';
    const [engagement] = await db
      .insert(serviceEngagements)
      .values({
        serviceCatalogItemId: onboardingCatalogId,
        payerPersonId: person.id,
        beneficiaryPersonId: person.id,
        agreedAmount: amountEUR,
        currencyCode: eurRow.code,
        status: 'ACTIVE',
      })
      .returning();
    if (!engagement) throw new Error(`engagement insert failed at i=${i}`);

    const receivedAt = new Date(seedRunAt);
    receivedAt.setDate(receivedAt.getDate() - (i % 60)); // spread across last 60 days
    const [payment] = await db
      .insert(payments)
      .values({
        serviceEngagementId: engagement.id,
        amount: amountEUR,
        currencyCode: eurRow.code,
        method: pick(['BANK_TRANSFER', 'CASH', 'OTHER'] as const, i),
        status: 'VERIFIED',
        proofReference: `SEED-${i}-${suffix}`,
        receivedAt,
        verifiedAt: receivedAt,
        verifiedByUserId: staffUser.id,
      })
      .returning();
    if (!payment) throw new Error(`payment insert failed at i=${i}`);

    // Invoice and receipt with hand-issued numbers (skip the row-locked
    // sequence used by the live flow — that's overkill for seed data).
    const yr = seedRunAt.getFullYear();
    const invoiceNumber = `SEED-INV-${yr}-${String(1000 + i).padStart(5, '0')}`;
    const receiptNumber = `SEED-RCP-${yr}-${String(1000 + i).padStart(5, '0')}`;
    const [invoice] = await db
      .insert(invoices)
      .values({
        number: invoiceNumber,
        payerPersonId: person.id,
        serviceEngagementId: engagement.id,
        subtotal: amountEUR,
        taxAmount: '0.00',
        totalAmount: amountEUR,
        currencyCode: eurRow.code,
        lineDescription: `Candidate Onboarding — ${firstName} ${lastName}`,
        status: 'PAID',
        issuedByUserId: staffUser.id,
        issuedAt: receivedAt,
      })
      .returning();
    if (!invoice) throw new Error(`invoice insert failed at i=${i}`);

    await db.insert(receipts).values({
      number: receiptNumber,
      paymentId: payment.id,
      invoiceId: invoice.id,
      payerPersonId: person.id,
      amount: amountEUR,
      currencyCode: eurRow.code,
      receivedAt,
      issuedByUserId: staffUser.id,
      issuedAt: receivedAt,
    });

    candidateResults.push({
      personId: person.id,
      profileId: profile.id,
      firstName,
      lastName,
      amountEUR,
    });

    if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/100 candidates seeded`);
  }
  console.log(`  ✓ 100 candidates + engagements + invoices + receipts inserted`);

  // ─── 8 employers + contacts ──────────────────────────────────────────

  console.log('▶ Seeding 8 employers…');
  const EMPLOYERS: Array<{
    legalName: string;
    tradingName?: string;
    industry: string;
    city: string;
    country: string;
    website: string;
  }> = [
    {
      legalName: 'Emerald Construction Ltd',
      tradingName: 'Emerald Build',
      industry: 'Construction',
      city: 'Dublin',
      country: 'Ireland',
      website: 'https://emeraldbuild.example.ie',
    },
    {
      legalName: 'Shannon Tech Group Ltd',
      industry: 'Software',
      city: 'Limerick',
      country: 'Ireland',
      website: 'https://shannontech.example.ie',
    },
    {
      legalName: 'Cliffside Hotels Ireland Ltd',
      tradingName: 'Cliffside Hotels',
      industry: 'Hospitality',
      city: 'Galway',
      country: 'Ireland',
      website: 'https://cliffsidehotels.example.ie',
    },
    {
      legalName: 'Liffey Care Group Ltd',
      industry: 'Healthcare',
      city: 'Dublin',
      country: 'Ireland',
      website: 'https://liffeycare.example.ie',
    },
    {
      legalName: 'Blackrock Logistics Ltd',
      industry: 'Logistics',
      city: 'Cork',
      country: 'Ireland',
      website: 'https://blackrocklog.example.ie',
    },
    {
      legalName: 'Dublin Culinary Group Ltd',
      tradingName: 'DCG Restaurants',
      industry: 'Hospitality',
      city: 'Dublin',
      country: 'Ireland',
      website: 'https://dcg.example.ie',
    },
    {
      legalName: 'Meridian Retail Ltd',
      industry: 'Retail',
      city: 'Waterford',
      country: 'Ireland',
      website: 'https://meridian.example.ie',
    },
    {
      legalName: 'Atlantic Engineering Ltd',
      industry: 'Engineering',
      city: 'Sligo',
      country: 'Ireland',
      website: 'https://atlanticeng.example.ie',
    },
  ];
  const employerIds: string[] = [];
  for (let i = 0; i < EMPLOYERS.length; i++) {
    const e = EMPLOYERS[i]!;
    const [row] = await db
      .insert(employers)
      .values({
        legalName: e.legalName,
        tradingName: e.tradingName ?? null,
        industry: e.industry,
        city: e.city,
        country: e.country,
        website: e.website,
        relationshipStatus: 'ACTIVE',
        assignedUserId: staffUser.id,
      })
      .returning({ id: employers.id });
    if (!row) throw new Error(`employer insert failed for ${e.legalName}`);
    employerIds.push(row.id);

    // One primary HR contact per employer.
    const contactFirst = pickRandom(IRISH_FIRST);
    const contactLast = pickRandom(IRISH_LAST);
    await db.insert(employerContacts).values({
      employerId: row.id,
      fullName: `${contactFirst} ${contactLast}`,
      jobTitle: 'HR Manager',
      email: `hr@${e.website.replace('https://', '')}`,
      phone: `+35318${String(2_000_000 + i).padStart(7, '0')}`,
      isPrimary: true,
    });
  }
  console.log(`  ✓ ${employerIds.length} employers + contacts inserted`);

  // ─── 15 requisitions across employers ────────────────────────────────

  console.log('▶ Seeding 15 requisitions…');
  const REQ_SPECS: Array<{
    title: string;
    occupationName: string;
    positionsRequired: number;
    employmentType: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT';
    location: string;
    description: string;
    requiredSkills: string[];
  }> = [
    {
      title: 'Senior Plumber — Dublin Sites',
      occupationName: 'Plumber',
      positionsRequired: 3,
      employmentType: 'FULL_TIME',
      location: 'Dublin, Ireland',
      description: 'Commercial plumbing works across multiple Dublin build sites.',
      requiredSkills: ['Plumbing', 'Safe Pass'],
    },
    {
      title: 'Electrician (Level 6)',
      occupationName: 'Electrician',
      positionsRequired: 2,
      employmentType: 'FULL_TIME',
      location: 'Dublin, Ireland',
      description: 'Electrical fit-out for new-build offices; RECI-registered work.',
      requiredSkills: ['Electrical Wiring', 'Safe Pass'],
    },
    {
      title: 'Full-Stack Software Engineer',
      occupationName: 'Software Engineer',
      positionsRequired: 2,
      employmentType: 'FULL_TIME',
      location: 'Limerick, Ireland',
      description: 'TypeScript / React / Node.js product team; hybrid.',
      requiredSkills: ['TypeScript', 'React', 'Node.js'],
    },
    {
      title: 'Data Analyst',
      occupationName: 'Data Analyst',
      positionsRequired: 1,
      employmentType: 'FULL_TIME',
      location: 'Limerick, Ireland',
      description: 'BI reporting + SQL data pipelines for product analytics.',
      requiredSkills: ['SQL', 'Excel'],
    },
    {
      title: 'Head Chef — Cliffside Galway',
      occupationName: 'Chef',
      positionsRequired: 1,
      employmentType: 'FULL_TIME',
      location: 'Galway, Ireland',
      description: 'Leading the kitchen at our flagship Galway hotel; à-la-carte + banquets.',
      requiredSkills: ['Cooking', 'HACCP Level 2', 'Team Leadership'],
    },
    {
      title: 'Sous Chef — Multiple Locations',
      occupationName: 'Chef',
      positionsRequired: 4,
      employmentType: 'FULL_TIME',
      location: 'Dublin, Ireland',
      description: 'Sous chef roles across our restaurant portfolio.',
      requiredSkills: ['Cooking', 'HACCP Level 2'],
    },
    {
      title: 'Waiter / Waitress',
      occupationName: 'Waiter / Waitress',
      positionsRequired: 6,
      employmentType: 'PART_TIME',
      location: 'Dublin, Ireland',
      description: 'Front-of-house across DCG restaurant portfolio.',
      requiredSkills: ['Customer Service'],
    },
    {
      title: 'Registered Nurse — Nursing Home',
      occupationName: 'Registered Nurse',
      positionsRequired: 4,
      employmentType: 'FULL_TIME',
      location: 'Dublin, Ireland',
      description: 'NMBI-registered nurses for residential care unit.',
      requiredSkills: ['Patient Care', 'First Aid'],
    },
    {
      title: 'Care Worker',
      occupationName: 'Care Worker',
      positionsRequired: 8,
      employmentType: 'FULL_TIME',
      location: 'Dublin, Ireland',
      description: 'Day + night shifts across residential care units.',
      requiredSkills: ['Patient Care', 'First Aid'],
    },
    {
      title: 'HGV Class C Driver',
      occupationName: 'HGV Driver',
      positionsRequired: 3,
      employmentType: 'FULL_TIME',
      location: 'Cork, Ireland',
      description: 'National distribution routes ex-Cork.',
      requiredSkills: ['HGV Class C'],
    },
    {
      title: 'Warehouse Operative',
      occupationName: 'Warehouse Operative',
      positionsRequired: 5,
      employmentType: 'FULL_TIME',
      location: 'Cork, Ireland',
      description: 'Picking, packing, dispatch — warehouse in Cork depot.',
      requiredSkills: ['Forklift Operation'],
    },
    {
      title: 'Retail Sales Associate',
      occupationName: 'Sales Representative',
      positionsRequired: 4,
      employmentType: 'PART_TIME',
      location: 'Waterford, Ireland',
      description: 'Retail floor + POS across our Waterford stores.',
      requiredSkills: ['Customer Service'],
    },
    {
      title: 'Structural Welder',
      occupationName: 'Welder',
      positionsRequired: 2,
      employmentType: 'CONTRACT',
      location: 'Sligo, Ireland',
      description: 'Structural steel welding for civil projects.',
      requiredSkills: ['MIG Welding', 'Safe Pass'],
    },
    {
      title: 'Civil Engineer',
      occupationName: 'Civil Engineer',
      positionsRequired: 1,
      employmentType: 'FULL_TIME',
      location: 'Sligo, Ireland',
      description: 'Design + on-site engineering for infrastructure works.',
      requiredSkills: ['Team Leadership'],
    },
    {
      title: 'Diesel Mechanic',
      occupationName: 'Mechanic',
      positionsRequired: 2,
      employmentType: 'FULL_TIME',
      location: 'Cork, Ireland',
      description: 'Fleet maintenance — HGVs and delivery vans.',
      requiredSkills: ['Team Leadership'],
    },
  ];

  const occByName = new Map(allOccupations.map((o) => [o.name.toLowerCase(), o]));
  const skillByName = new Map(allSkills.map((s) => [s.name.toLowerCase(), s]));

  const employerRoundRobin = (i: number): string => employerIds[i % employerIds.length]!;

  for (let i = 0; i < REQ_SPECS.length; i++) {
    const spec = REQ_SPECS[i]!;
    const occupation = occByName.get(spec.occupationName.toLowerCase());
    if (!occupation) {
      console.warn(`  ⚠ occupation not found: ${spec.occupationName} — skipping ${spec.title}`);
      continue;
    }
    const [req] = await db
      .insert(jobRequisitions)
      .values({
        employerId: employerRoundRobin(i),
        title: spec.title,
        occupationId: occupation.id,
        positionsRequired: spec.positionsRequired,
        positionsFilled: 0,
        location: spec.location,
        employmentType: spec.employmentType,
        description: spec.description,
        candidateRequirements: `Requires: ${spec.requiredSkills.join(', ')}. Full training given for gaps.`,
        status: 'OPEN',
        assignedUserId: staffUser.id,
      })
      .returning({ id: jobRequisitions.id });
    if (!req) throw new Error(`requisition insert failed for ${spec.title}`);

    for (const s of spec.requiredSkills) {
      const skillRow = skillByName.get(s.toLowerCase());
      if (skillRow) {
        await db
          .insert(requisitionSkills)
          .values({ jobRequisitionId: req.id, skillId: skillRow.id, isRequired: true })
          .onConflictDoNothing();
      }
    }
  }
  console.log(`  ✓ ${REQ_SPECS.length} requisitions inserted`);

  console.log('\n✔ Seed complete.');
  console.log(`  Candidates: 100`);
  console.log(`  Employers:  ${employerIds.length}`);
  console.log(`  Requisitions: ${REQ_SPECS.length}`);
  console.log(`\n  Suggested next: open /matching in the UI and run matching per requisition.`);
  void and; // silence unused import when tsc is strict
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('✖ Seed failed:', err);
    process.exit(1);
  });
