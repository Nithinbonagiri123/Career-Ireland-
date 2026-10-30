import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { e2eAdminId } from './helpers/owner';

/**
 * Stage B Wave 2 — CV extraction correctness, certification entry,
 * upload UX, passport expiry. Drives real files (text PDF, scanned/
 * image-only PDF, DOCX from e2e/fixtures/) through the real UI.
 * Requires local MinIO (skipped wholesale when E2E_SKIP_UPLOAD is set,
 * matching the other upload suites).
 */

const SHOTS_DIR = path.resolve('playwright/stage-b-wave2');
fs.mkdirSync(SHOTS_DIR, { recursive: true });
const FIXTURES = path.resolve('e2e/fixtures');

const UPLOADS_DISABLED = !!process.env.E2E_SKIP_UPLOAD;

async function dbModules() {
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: '.env.local' });
  const { eq, and, inArray } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const persons = await import('../src/lib/db/schema/persons');
  const documents = await import('../src/lib/db/schema/documents');
  const reference = await import('../src/lib/db/schema/reference');
  const uploadRequests = await import('../src/lib/db/schema/document_upload_requests');
  const cv = await import('../src/lib/db/schema/cv_extractions');
  const details = await import('../src/lib/db/schema/candidate_details');
  const users = await import('../src/lib/db/schema/users');
  return {
    db,
    eq,
    and,
    inArray,
    schemas: {
      ...persons,
      ...documents,
      ...reference,
      ...uploadRequests,
      ...cv,
      ...details,
      ...users,
    },
  };
}

async function seedPerson(m: Awaited<ReturnType<typeof dbModules>>, stamp: string) {
  const [person] = await m.db
    .insert(m.schemas.persons)
    .values({
      firstName: 'Wave2',
      lastName: `Docs-${stamp}`,
      email: `wave2-${stamp}@example.test`,
      source: 'DIRECT',
    })
    .returning({ id: m.schemas.persons.id });
  if (!person) throw new Error('person seed failed');
  // The candidate Overview grid (Certifications card etc.) renders for
  // activated candidates — give the fixture a profile.
  await m.db.insert(m.schemas.candidateProfiles).values({
    assignedUserId: await e2eAdminId(),
    personId: person.id,
    lifecycleStatus: 'ACTIVE',
    availabilityStatus: 'AVAILABLE',
  });
  return person.id;
}

async function cleanupPerson(m: Awaited<ReturnType<typeof dbModules>>, personId: string) {
  const { eq, schemas, db } = m;
  const docs = await db
    .select({ id: schemas.documentInstances.id })
    .from(schemas.documentInstances)
    .where(eq(schemas.documentInstances.ownerPersonId, personId));
  const docIds = docs.map((d) => d.id);
  if (docIds.length > 0) {
    await db
      .delete(schemas.cvExtractions)
      .where(m.inArray(schemas.cvExtractions.documentInstanceId, docIds));
    await db
      .delete(schemas.documentRequirementFulfillments)
      .where(m.inArray(schemas.documentRequirementFulfillments.documentInstanceId, docIds));
    await db
      .delete(schemas.documentInstances)
      .where(m.inArray(schemas.documentInstances.id, docIds));
  }
  await db
    .delete(schemas.documentUploadRequests)
    .where(eq(schemas.documentUploadRequests.personId, personId));
  await db
    .delete(schemas.candidateDocumentRequirements)
    .where(eq(schemas.candidateDocumentRequirements.personId, personId));
  await db
    .delete(schemas.candidateQualifications)
    .where(eq(schemas.candidateQualifications.personId, personId));
  await db
    .delete(schemas.candidateProfiles)
    .where(eq(schemas.candidateProfiles.personId, personId));
  await db.delete(schemas.persons).where(eq(schemas.persons.id, personId));
}

/** Stage a fixture through the docs-tab dropzone input and press Upload. */
async function uploadViaDocsTab(page: import('@playwright/test').Page, filePath: string) {
  await page.locator('input[type="file"]').first().setInputFiles(filePath);
  const uploadBtn = page.getByRole('button', { name: /^Upload \d+ file/ });
  await expect(uploadBtn).toBeEnabled({ timeout: 10_000 });
  await uploadBtn.click();
  await expect(page.getByText(/file uploaded/).first()).toBeVisible({ timeout: 20_000 });
}

test.describe('Wave 2 — CV scanning and uploads', () => {
  test.skip(UPLOADS_DISABLED, 'uploads disabled in this environment');

  test('scan: text PDF suggests, save-to-profile works, scanned PDF errors without touching the profile, DOCX parses', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const stamp = Math.random().toString(36).slice(2, 6);
    const m = await dbModules();
    const personId = await seedPerson(m, stamp);
    try {
      await page.setViewportSize({ width: 1440, height: 1200 });
      await page.goto(`/clients/${personId}?tab=documents-candidate`);
      await expect(page.getByText('Upload documents').first()).toBeVisible({ timeout: 15_000 });

      // ── Text PDF: upload → scan → certification + employer suggested.
      await uploadViaDocsTab(page, path.join(FIXTURES, 'cv-text.pdf'));
      await page
        .getByRole('button', { name: /Scan CV/i })
        .first()
        .click();
      await expect(page.getByText(/suggestions? ready to review/)).toBeVisible({
        timeout: 30_000,
      });
      // Save is blocked until something is picked (review-before-save).
      const saveBtn = page.getByRole('button', { name: 'Save to profile' });
      await expect(saveBtn).toBeDisabled();
      await page.getByRole('button', { name: 'Qualifications', exact: true }).click();
      await page.getByRole('button', { name: 'Manual Handling Certificate' }).click();
      await expect(saveBtn).toBeEnabled();
      await saveBtn.click();
      await expect(page.getByText('Saved to profile')).toBeVisible({ timeout: 15_000 });

      // Work-experience employer names from the same scan…
      await page
        .getByRole('button', { name: /Scan CV/i })
        .first()
        .click();
      await expect(page.getByText(/ready to review|nothing new/)).toBeVisible({
        timeout: 30_000,
      });
      await page.getByRole('button', { name: 'Work Experience' }).click();
      await expect(page.getByText('Mediclinic Cape Town').first()).toBeVisible();

      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(SHOTS_DIR, `scan-suggestions-1440-${stamp}.png`) });

      // ── Scanned/image-only PDF becomes the newest CV: scan reports a
      //    persistent OCR-needed error and the saved profile is intact.
      await uploadViaDocsTab(page, path.join(FIXTURES, 'cv-scanned.pdf'));
      await page
        .getByRole('button', { name: /Scan CV/i })
        .first()
        .click();
      await expect(page.getByText(/No readable text found/).first()).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText(/OCR is not available/).first()).toBeVisible();
      await page.screenshot({ path: path.join(SHOTS_DIR, `scan-ocr-error-${stamp}.png`) });

      // Profile untouched by the failed scan.
      await page.goto(`/clients/${personId}`);
      await expect(page.getByText('Manual Handling Certificate').first()).toBeVisible({
        timeout: 15_000,
      });

      // ── DOCX becomes the newest CV: parses and suggests again.
      await page.goto(`/clients/${personId}?tab=documents-candidate`);
      await expect(page.getByText('Upload documents').first()).toBeVisible({ timeout: 15_000 });
      await uploadViaDocsTab(page, path.join(FIXTURES, 'cv-text.docx'));
      await page
        .getByRole('button', { name: /Scan CV/i })
        .first()
        .click();
      await expect(page.getByText(/ready to review|nothing new/)).toBeVisible({
        timeout: 30_000,
      });
      await page.getByRole('button', { name: 'Work Experience' }).click();
      await expect(page.getByText('Golden Years Nursing Home').first()).toBeVisible();

      // Visual evidence at tablet + mobile.
      await page.setViewportSize({ width: 820, height: 1400 });
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(SHOTS_DIR, `docs-tab-820-${stamp}.png`) });
      await page.setViewportSize({ width: 390, height: 1600 });
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(SHOTS_DIR, `docs-tab-390-${stamp}.png`) });
    } finally {
      await cleanupPerson(m, personId);
    }
  });

  test('upload UX: ZIP, HEIC and oversize files are rejected with persistent reasons', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const stamp = Math.random().toString(36).slice(2, 6);
    const m = await dbModules();
    const personId = await seedPerson(m, stamp);
    try {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(`/clients/${personId}?tab=documents-candidate`);
      await expect(page.getByText('Upload documents').first()).toBeVisible({ timeout: 15_000 });

      const input = page.locator('input[type="file"]').first();
      await input.setInputFiles([
        { name: 'bundle.zip', mimeType: 'application/zip', buffer: Buffer.from('PK\x03\x04zip') },
        { name: 'photo.heic', mimeType: 'image/heic', buffer: Buffer.from('heic-bytes') },
        {
          name: 'huge-scan.pdf',
          mimeType: 'application/pdf',
          buffer: Buffer.alloc(11 * 1024 * 1024, 1),
        },
      ]);
      await expect(page.getByText('Some files could not be uploaded')).toBeVisible();
      await expect(page.getByText(/archives aren't accepted/)).toBeVisible();
      await expect(page.getByText(/iPhone photos are HEIC/)).toBeVisible();
      await expect(page.getByText(/larger than the 10 MB limit/)).toBeVisible();
      // Nothing was staged for upload.
      await expect(page.getByRole('button', { name: /^Upload \d+ file/ })).toHaveCount(0);
      await page.screenshot({ path: path.join(SHOTS_DIR, `upload-errors-${stamp}.png`) });
      // Dismiss works.
      await page.getByRole('button', { name: 'Dismiss upload errors' }).click();
      await expect(page.getByText('Some files could not be uploaded')).toHaveCount(0);
    } finally {
      await cleanupPerson(m, personId);
    }
  });

  test('passport expiry: captured at upload, shown in the table, editable from the row menu', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const stamp = Math.random().toString(36).slice(2, 6);
    const m = await dbModules();
    const personId = await seedPerson(m, stamp);
    try {
      await page.setViewportSize({ width: 1440, height: 1200 });
      await page.goto(`/clients/${personId}?tab=documents-candidate`);
      await expect(page.getByText('Upload documents').first()).toBeVisible({ timeout: 15_000 });

      // Staging a passport-named PNG auto-picks the passport type, which
      // tracks expiry → the optional expiry input appears.
      await page
        .locator('input[type="file"]')
        .first()
        .setInputFiles(path.join(FIXTURES, 'passport-scan.png'));
      await expect(page.getByText(/Ready to upload/)).toBeVisible();
      const expiryInput = page.locator('input[type="date"]').first();
      await expect(expiryInput).toBeVisible();
      await expiryInput.fill('2030-05-01');
      await page.getByRole('button', { name: /^Upload 1 file/ }).click();
      await expect(page.getByText(/file uploaded/).first()).toBeVisible({ timeout: 20_000 });

      // Expiry column shows the absolute date.
      await expect(page.getByText('01 May 2030')).toBeVisible({ timeout: 15_000 });
      await page.screenshot({ path: path.join(SHOTS_DIR, `passport-expiry-${stamp}.png`) });

      // Edit via the row menu — scope to the document row (the hero has
      // its own "More actions" button).
      await page
        .locator('tr', { hasText: 'passport-scan' })
        .getByRole('button', { name: 'More actions' })
        .click();
      await page.getByRole('button', { name: 'Set expiry…' }).click();
      const menuDate = page.locator('input[type="date"]').last();
      await menuDate.fill('2031-01-15');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByText('Expiry date saved')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText('15 Jan 2031')).toBeVisible({ timeout: 15_000 });
    } finally {
      await cleanupPerson(m, personId);
    }
  });

  test('magic-link upload captures the expiry date for expiry-tracked types', async ({ page }) => {
    test.setTimeout(180_000);
    const stamp = Math.random().toString(36).slice(2, 6);
    const m = await dbModules();
    const personId = await seedPerson(m, stamp);
    const token = `w2-${stamp}-${randomUUID()}`;
    try {
      const [admin] = await m.db
        .select({ id: m.schemas.users.id })
        .from(m.schemas.users)
        .where(m.eq(m.schemas.users.email, 'e2e-admin@ireland-careers.test'))
        .limit(1);
      if (!admin) throw new Error('e2e admin missing');
      const [passportType] = await m.db
        .select({ id: m.schemas.documentTypes.id })
        .from(m.schemas.documentTypes)
        .where(m.eq(m.schemas.documentTypes.code, 'PASSPORT_BIOMETRIC'))
        .limit(1);
      if (!passportType) throw new Error('passport type missing');
      const [cvType] = await m.db
        .select({ id: m.schemas.documentTypes.id })
        .from(m.schemas.documentTypes)
        .where(m.eq(m.schemas.documentTypes.code, 'CV'))
        .limit(1);
      if (!cvType) throw new Error('CV type missing');
      const [req] = await m.db
        .insert(m.schemas.candidateDocumentRequirements)
        .values({ personId, documentTypeId: passportType.id })
        .returning({ id: m.schemas.candidateDocumentRequirements.id });
      if (!req) throw new Error('requirement seed failed');
      // A second (unfulfilled) requirement keeps the link active after
      // the passport upload — a fully completed link immediately
      // re-renders as "no longer valid" (pre-existing behaviour, noted
      // in the Wave 2 report).
      const [req2] = await m.db
        .insert(m.schemas.candidateDocumentRequirements)
        .values({ personId, documentTypeId: cvType.id })
        .returning({ id: m.schemas.candidateDocumentRequirements.id });
      if (!req2) throw new Error('requirement seed failed');
      await m.db.insert(m.schemas.documentUploadRequests).values({
        tokenHash: createHash('sha256').update(token).digest('hex'),
        personId,
        requestedRequirementIds: [req.id, req2.id],
        createdByUserId: admin.id,
        expiresAt: new Date(Date.now() + 86_400_000),
      });

      await page.setViewportSize({ width: 820, height: 1000 });
      await page.goto(`/upload/${token}`);
      const passportRow = page.locator('li', { hasText: /Passport/i }).first();
      await expect(passportRow).toBeVisible({ timeout: 15_000 });
      // The expiry-tracked requirement asks for the date before the file;
      // the CV requirement (no expiry) must not show one.
      const expiry = passportRow.locator('input[type="date"]');
      await expect(expiry).toBeVisible();
      await expect(page.locator('li', { hasText: /CV/ }).locator('input[type="date"]')).toHaveCount(
        0,
      );
      await expiry.fill('2032-07-20');
      await passportRow
        .locator('input[type="file"]')
        .setInputFiles(path.join(FIXTURES, 'passport-scan.png'));
      // Exact pill text — a substring match would hit the footer's
      // "…email you received…" long before the upload finishes.
      await expect(passportRow.getByText('Received', { exact: true })).toBeVisible({
        timeout: 45_000,
      });
      await page.screenshot({ path: path.join(SHOTS_DIR, `magic-link-expiry-${stamp}.png`) });

      await expect(async () => {
        const [doc] = await m.db
          .select({ expiresOn: m.schemas.documentInstances.expiresOn })
          .from(m.schemas.documentInstances)
          .where(m.eq(m.schemas.documentInstances.ownerPersonId, personId))
          .limit(1);
        expect(doc?.expiresOn).toBe('2032-07-20');
      }).toPass({ timeout: 15_000 });
    } finally {
      await cleanupPerson(m, personId);
    }
  });

  test('magic-link: uploading the FINAL document shows a success screen, not "link no longer valid"', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const stamp = Math.random().toString(36).slice(2, 6);
    const m = await dbModules();
    const personId = await seedPerson(m, stamp);
    const token = `w2f-${stamp}-${randomUUID()}`;
    try {
      const [admin] = await m.db
        .select({ id: m.schemas.users.id })
        .from(m.schemas.users)
        .where(m.eq(m.schemas.users.email, 'e2e-admin@ireland-careers.test'))
        .limit(1);
      if (!admin) throw new Error('e2e admin missing');
      const [passportType] = await m.db
        .select({ id: m.schemas.documentTypes.id })
        .from(m.schemas.documentTypes)
        .where(m.eq(m.schemas.documentTypes.code, 'PASSPORT_BIOMETRIC'))
        .limit(1);
      if (!passportType) throw new Error('passport type missing');
      const [req] = await m.db
        .insert(m.schemas.candidateDocumentRequirements)
        .values({ personId, documentTypeId: passportType.id })
        .returning({ id: m.schemas.candidateDocumentRequirements.id });
      if (!req) throw new Error('requirement seed failed');
      await m.db.insert(m.schemas.documentUploadRequests).values({
        tokenHash: createHash('sha256').update(token).digest('hex'),
        personId,
        requestedRequirementIds: [req.id],
        createdByUserId: admin.id,
        expiresAt: new Date(Date.now() + 86_400_000),
      });

      await page.setViewportSize({ width: 820, height: 1000 });
      await page.goto(`/upload/${token}`);
      const passportRow = page.locator('li', { hasText: /Passport/i }).first();
      await expect(passportRow).toBeVisible({ timeout: 15_000 });
      await passportRow
        .locator('input[type="file"]')
        .setInputFiles(path.join(FIXTURES, 'passport-scan.png'));

      // The final upload completes the link — the candidate must see a
      // success confirmation, never "link no longer valid".
      await expect(page.getByText('All documents received').first()).toBeVisible({
        timeout: 45_000,
      });
      await expect(page.getByText('This upload link is no longer valid')).toHaveCount(0);
      await page.screenshot({
        path: path.join(SHOTS_DIR, `magic-link-complete-${stamp}.png`),
      });

      // A revisit/refresh of the consumed link also lands on the
      // success screen, not the invalid screen.
      await page.reload();
      await expect(page.getByText('All documents received').first()).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText('This upload link is no longer valid')).toHaveCount(0);
      await page.screenshot({
        path: path.join(SHOTS_DIR, `magic-link-complete-reload-${stamp}.png`),
      });
    } finally {
      await cleanupPerson(m, personId);
    }
  });
});

test('certifications: typed text adds a custom entry from the Overview card', async ({ page }) => {
  test.setTimeout(120_000);
  const stamp = Math.random().toString(36).slice(2, 6);
  const m = await dbModules();
  const personId = await seedPerson(m, stamp);
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/clients/${personId}`);
    await expect(page.getByText('Certifications & licences')).toBeVisible({ timeout: 15_000 });

    // "+ Add" on the card opens the dialog directly (used to be a tab link).
    const certCard = page
      .locator('div')
      .filter({ hasText: /^Certifications & licences/ })
      .first();
    await expect(async () => {
      // exact — the Wave 3 Notes card added a sibling "+ Add note" button.
      await page.getByRole('button', { name: '+ Add', exact: true }).click();
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    const dialog = page.getByRole('dialog');

    // Typing alone (no suggestion click) is enough — the regression the
    // client reported ("adding certifications fails").
    await dialog.getByLabel('Qualification').fill(`Manual Handling Cert W2-${stamp}`);
    const addBtn = dialog.getByRole('button', { name: 'Add', exact: true });
    await expect(addBtn).toBeEnabled();
    await addBtn.click();
    await expect(page.getByText('Qualification added')).toBeVisible({ timeout: 15_000 });
    await expect(certCard.getByText(`Manual Handling Cert W2-${stamp}`)).toBeVisible({
      timeout: 15_000,
    });

    // A duplicate explains itself instead of a generic failure.
    await expect(async () => {
      // exact — the Wave 3 Notes card added a sibling "+ Add note" button.
      await page.getByRole('button', { name: '+ Add', exact: true }).click();
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    await page
      .getByRole('dialog')
      .getByLabel('Qualification')
      .fill(`Manual Handling Cert W2-${stamp}`);
    await page.getByRole('dialog').getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText(/already/i).first()).toBeVisible({ timeout: 15_000 });
  } finally {
    await cleanupPerson(m, personId);
  }
});
