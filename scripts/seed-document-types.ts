import { config } from 'dotenv';

// Load env BEFORE importing anything that reads process.env at import time.
config({ path: '.env.local' });

/**
 * Idempotent seed for the full document-type catalog Tracey uses on real
 * work-permit / VISA cases. Sourced from her two PDFs:
 *
 *   1. "Documents required for Emigration" — work permit + VISA docs
 *   2. "Document Checklist & Work Permit Checklist" — internal checklist
 *
 * Skipped: PAYMENT_PROOF and CV — already seeded by
 * `ensureDocumentTypeByCode` at runtime, so we don't touch them here.
 *
 * `hasExpiry: true` mirrors the PDF's "stamp date must be no older than
 * 6 months" rule; anything with a freshness requirement gets it so the
 * requirements engine can flag stale docs.
 *
 *   Usage:
 *     pnpm tsx scripts/seed-document-types.ts
 *
 *   Prod:
 *     DATABASE_URL='<prod URL>' pnpm tsx scripts/seed-document-types.ts
 */

type Seed = {
  code: string;
  name: string;
  hasExpiry: boolean;
  appliesTo: 'PERSON' | 'EMPLOYER' | 'BOTH';
};

const SEEDS: Seed[] = [
  // ── Work Permit Application (PDF 1 §"Work Permit Application Documents") ──
  {
    code: 'PASSPORT_BIOMETRIC',
    name: 'Biometric Page of Passport',
    hasExpiry: false,
    appliesTo: 'PERSON',
  },
  {
    code: 'PASSPORT_FULL',
    name: 'Passport (full copy — current + previous)',
    hasExpiry: false,
    appliesTo: 'PERSON',
  },
  {
    code: 'DRIVER_LICENCE_FB',
    name: "Driver's Licence — Front & Back",
    hasExpiry: false,
    appliesTo: 'PERSON',
  },
  {
    code: 'DRIVER_LICENCE_LOE',
    name: 'Driver Licence Letter of Entitlement',
    hasExpiry: true,
    appliesTo: 'PERSON',
  },
  { code: 'POLICE_CLEARANCE', name: 'Police Clearance', hasExpiry: true, appliesTo: 'PERSON' },
  {
    code: 'CERTIFICATES_DIPLOMAS',
    name: 'Certificates / Diplomas',
    hasExpiry: false,
    appliesTo: 'PERSON',
  },
  { code: 'SUBJECTS_LIST', name: 'List of Subjects Taken', hasExpiry: false, appliesTo: 'PERSON' },
  { code: 'PASSPORT_PHOTO', name: 'Passport Photo', hasExpiry: true, appliesTo: 'PERSON' },
  {
    code: 'PROOF_OF_ADDRESS',
    name: 'Proof of Current Address',
    hasExpiry: false,
    appliesTo: 'PERSON',
  },
  {
    code: 'REFERENCE_LETTER',
    name: 'Reference Letter from Employer',
    hasExpiry: false,
    appliesTo: 'PERSON',
  },
  { code: 'NARIC_REFERENCE', name: 'NARIC Reference', hasExpiry: false, appliesTo: 'PERSON' },
  { code: 'MOTIVATION_LETTER', name: 'Motivation Letter', hasExpiry: false, appliesTo: 'PERSON' },
  {
    code: 'IRP_CARD',
    name: 'IRP Card (Irish Residence Permit)',
    hasExpiry: false,
    appliesTo: 'PERSON',
  },
  { code: 'PPS_NUMBER', name: 'PPS Number (card / letter)', hasExpiry: false, appliesTo: 'PERSON' },
  {
    code: 'UNABRIDGED_BIRTH_CERT',
    name: 'Unabridged Birth Certificate',
    hasExpiry: false,
    appliesTo: 'PERSON',
  },

  // ── VISA Application (PDF 1 §"VISA Application") ─────────────────────────
  {
    code: 'RESIDENCY_CARD',
    name: 'Copy of Residency Card (e.g. SA ID)',
    hasExpiry: false,
    appliesTo: 'PERSON',
  },
  {
    code: 'JOB_CONTRACT_OFFER',
    name: 'Signed Job Contract / Employment Offer',
    hasExpiry: false,
    appliesTo: 'PERSON',
  },
  {
    code: 'APPROVED_WORK_PERMIT',
    name: 'Copy of Approved Employment Work Permit',
    hasExpiry: false,
    appliesTo: 'PERSON',
  },
  {
    code: 'DECLARATION_COMPLIANCE',
    name: 'Declaration of Compliance / Undertaking',
    hasExpiry: false,
    appliesTo: 'PERSON',
  },
  {
    code: 'PROOF_ACCOMMODATION',
    name: 'Proof of Accommodation',
    hasExpiry: false,
    appliesTo: 'PERSON',
  },
  {
    code: 'BANK_STATEMENT',
    name: 'Bank Statement (last 6 months)',
    hasExpiry: true,
    appliesTo: 'PERSON',
  },
  {
    code: 'PREVIOUS_VISA_REFUSALS',
    name: 'Previous Visa Refusals — original letter',
    hasExpiry: false,
    appliesTo: 'PERSON',
  },
  { code: 'PAYSLIPS', name: 'Payslips (3 most recent)', hasExpiry: false, appliesTo: 'PERSON' },
];

async function main() {
  // Deferred imports so dotenv has populated process.env first.
  const { eq } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const { documentTypes } = await import('../src/lib/db/schema/reference');

  console.log(`▶ Seeding ${SEEDS.length} document types…`);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const seed of SEEDS) {
    const [existing] = await db
      .select()
      .from(documentTypes)
      .where(eq(documentTypes.code, seed.code))
      .limit(1);

    if (!existing) {
      await db.insert(documentTypes).values({
        code: seed.code,
        name: seed.name,
        hasExpiry: seed.hasExpiry,
        appliesTo: seed.appliesTo,
        isActive: true,
      });
      inserted++;
      console.log(`  + inserted ${seed.code} — ${seed.name}`);
      continue;
    }

    // If the row exists but name/expiry/appliesTo drifted, patch it.
    const drift =
      existing.name !== seed.name ||
      existing.hasExpiry !== seed.hasExpiry ||
      existing.appliesTo !== seed.appliesTo;
    if (drift) {
      await db
        .update(documentTypes)
        .set({
          name: seed.name,
          hasExpiry: seed.hasExpiry,
          appliesTo: seed.appliesTo,
          updatedAt: new Date(),
        })
        .where(eq(documentTypes.code, seed.code));
      updated++;
      console.log(`  ~ updated  ${seed.code}`);
    } else {
      skipped++;
    }
  }

  console.log(
    `✔ Done. inserted=${inserted}, updated=${updated}, unchanged=${skipped}, total=${SEEDS.length}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error('✖ Seed failed:', err);
  process.exit(1);
});
