import { expect, test } from '@playwright/test';

/**
 * Release-readiness hardening — WARN-1 permission proof.
 *
 * setDocumentExpiry now enforces the Wave-1 grant model: ADMIN (or
 * owner) may edit any document's expiry; other internal roles need the
 * matching fine-grained grant (candidate_services.documents for
 * person-owned docs). Positive and negative cases through the real UI
 * and the real server action.
 */

async function dbModules() {
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: '.env.local' });
  const { eq } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const persons = await import('../src/lib/db/schema/persons');
  const documents = await import('../src/lib/db/schema/documents');
  const reference = await import('../src/lib/db/schema/reference');
  const users = await import('../src/lib/db/schema/users');
  return { db, eq, schemas: { ...persons, ...documents, ...reference, ...users } };
}

test('expiry edits: ADMIN allowed, ungranted STAFF refused by the server', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const stamp = Math.random().toString(36).slice(2, 6);
  const m = await dbModules();

  const [person] = await m.db
    .insert(m.schemas.persons)
    .values({
      firstName: 'Hardening',
      lastName: `Expiry-${stamp}`,
      email: `hardening-${stamp}@example.test`,
      source: 'DIRECT',
    })
    .returning({ id: m.schemas.persons.id });
  if (!person) throw new Error('person seed failed');
  const personId = person.id;
  await m.db
    .insert(m.schemas.candidateProfiles)
    .values({ personId, lifecycleStatus: 'ACTIVE', availabilityStatus: 'AVAILABLE' });
  const [docType] = await m.db
    .select({ id: m.schemas.documentTypes.id })
    .from(m.schemas.documentTypes)
    .where(m.eq(m.schemas.documentTypes.code, 'PASSPORT_BIOMETRIC'));
  const [adminUser] = await m.db
    .select({ id: m.schemas.users.id })
    .from(m.schemas.users)
    .where(m.eq(m.schemas.users.email, 'e2e-admin@ireland-careers.test'));
  if (!docType || !adminUser) throw new Error('fixtures missing');
  const [doc] = await m.db
    .insert(m.schemas.documentInstances)
    .values({
      ownerPersonId: personId,
      documentTypeId: docType.id,
      version: 1,
      status: 'UPLOADED',
      originalFilename: `hardening-passport-${stamp}.png`,
      mimeType: 'image/png',
      fileSizeBytes: 1234,
      s3Bucket: 'documents',
      s3ObjectKey: `2026/10/person/${personId}/${docType.id}/hardening-${stamp}.png`,
      uploadedByUserId: adminUser.id,
    })
    .returning({ id: m.schemas.documentInstances.id });
  if (!doc) throw new Error('document seed failed');

  const openExpiryEditor = async (p: import('@playwright/test').Page) => {
    await p.goto(`/clients/${personId}?tab=documents-candidate`);
    await expect(p.getByText(`hardening-passport-${stamp}`).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(async () => {
      await p
        .locator('tr', { hasText: `hardening-passport-${stamp}` })
        .getByRole('button', { name: 'More actions' })
        .click();
      await expect(p.getByRole('button', { name: 'Set expiry…' })).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    await p.getByRole('button', { name: 'Set expiry…' }).click();
    await p.locator('input[type="date"]').last().fill('2032-03-01');
    await p.getByRole('button', { name: 'Save', exact: true }).click();
  };

  try {
    // ── Negative: plain STAFF (no documents grant) — server refuses. ──
    const staffContext = await browser.newContext({
      storageState: 'playwright/.auth/staff.json',
      viewport: { width: 1440, height: 1100 },
    });
    const staffPage = await staffContext.newPage();
    await openExpiryEditor(staffPage);
    await expect(staffPage.getByText(/do not have the documents permission/)).toBeVisible({
      timeout: 15_000,
    });
    await staffContext.close();
    // The date must NOT have been written.
    const [afterStaff] = await m.db
      .select({ expiresOn: m.schemas.documentInstances.expiresOn })
      .from(m.schemas.documentInstances)
      .where(m.eq(m.schemas.documentInstances.id, doc.id));
    expect(afterStaff?.expiresOn).toBeNull();

    // ── Positive: ADMIN — allowed, audited, persisted. ────────────────
    await page.setViewportSize({ width: 1440, height: 1100 });
    await openExpiryEditor(page);
    await expect(page.getByText('Expiry date saved')).toBeVisible({ timeout: 15_000 });
    const [afterAdmin] = await m.db
      .select({ expiresOn: m.schemas.documentInstances.expiresOn })
      .from(m.schemas.documentInstances)
      .where(m.eq(m.schemas.documentInstances.id, doc.id));
    expect(afterAdmin?.expiresOn).toBe('2032-03-01');
  } finally {
    await m.db
      .delete(m.schemas.documentInstances)
      .where(m.eq(m.schemas.documentInstances.id, doc.id));
    await m.db
      .delete(m.schemas.candidateProfiles)
      .where(m.eq(m.schemas.candidateProfiles.personId, personId));
    await m.db.delete(m.schemas.persons).where(m.eq(m.schemas.persons.id, personId));
  }
});
