import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';

const SHOTS = path.join(process.cwd(), 'screenshots');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

async function shot(page: Page, name: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

/**
 * Ensure the person we land on has at least one MISSING requirement so
 * the "Send upload link" button is enabled. Idempotent — bails if
 * the person already has one. Uses drizzle directly so we don't
 * depend on the requirements refresh action wiring an occupation.
 */
async function ensureMissingRequirement(personId: string): Promise<{
  ok: boolean;
  message: string;
}> {
  const { and, eq, isNull } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const { candidateDocumentRequirements } = await import('../src/lib/db/schema/documents');
  const { documentUploadRequests } = await import('../src/lib/db/schema/document_upload_requests');
  const { documentTypes } = await import('../src/lib/db/schema/reference');

  // Purge any leftover active upload requests from previous runs — the
  // "Send upload link" button refuses to issue a fresh one while
  // another is still open.
  await db
    .update(documentUploadRequests)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(documentUploadRequests.personId, personId),
        isNull(documentUploadRequests.revokedAt),
        isNull(documentUploadRequests.completedAt),
      ),
    );

  const [existing] = await db
    .select({ id: candidateDocumentRequirements.id })
    .from(candidateDocumentRequirements)
    .where(
      and(
        eq(candidateDocumentRequirements.personId, personId),
        eq(candidateDocumentRequirements.status, 'MISSING'),
      ),
    )
    .limit(1);
  if (existing) return { ok: true, message: 'reused existing MISSING requirement' };

  const [dt] = await db
    .select({ id: documentTypes.id, name: documentTypes.name })
    .from(documentTypes)
    .where(eq(documentTypes.isActive, true))
    .limit(1);
  if (!dt) return { ok: false, message: 'no active document types in DB' };

  const inserted = await db
    .insert(candidateDocumentRequirements)
    .values({ personId, documentTypeId: dt.id, status: 'MISSING' })
    .onConflictDoNothing()
    .returning();
  return {
    ok: inserted.length > 0,
    message:
      inserted.length > 0
        ? `inserted requirement for ${dt.name}`
        : `insert conflicted (probably already exists non-MISSING) for ${dt.name}`,
  };
}

/**
 * Magic-link document upload — round-trip.
 *
 *   1. As staff, open a candidate profile → Documents tab → click
 *      "Send upload link" → confirm the dialog → the fresh URL is
 *      surfaced in an info banner and copy-able.
 *   2. Grab that URL and open it in a fresh anonymous context (no
 *      session cookies) → the public upload page renders with
 *      requested requirements.
 *   3. Verify the /upload/<invalid> path shows the "no longer valid"
 *      screen.
 */
test('staff issues an upload link, public page renders scoped upload UI', async ({
  browser,
  page,
}) => {
  test.setTimeout(90_000);
  // ── STAFF: land on any candidate profile that has an email.
  await page.goto('/leads', { waitUntil: 'networkidle' });
  const firstPerson = page.locator('a[href^="/candidates/"]').first();
  test.skip((await firstPerson.count()) === 0, 'no leads seeded');
  await firstPerson.click();
  await page.waitForURL(/\/candidates\/[0-9a-f-]+/i);
  const profileUrl = page.url();
  const personId = profileUrl.split('/candidates/')[1]?.split('?')[0] ?? '';
  const seed = await ensureMissingRequirement(personId);
  console.log(`ensureMissingRequirement(${personId}): ${seed.message}`);
  await page.reload({ waitUntil: 'networkidle' });

  // Documents tab renders both the "Ask the candidate to upload" panel
  // and the existing Documents section.
  await page.getByRole('tab', { name: /^documents$/i }).click();
  await expect(page.getByText(/ask the candidate to upload/i)).toBeVisible();
  await shot(page, 'e2e__upload-link-01-panel');

  // If the button is disabled because no MISSING requirements exist,
  // try materialising them from global rules first. That's what a
  // staff member would do anyway.
  const sendBtn = page.getByRole('button', { name: /send upload link/i });
  let isDisabled = await sendBtn.isDisabled().catch(() => true);
  if (isDisabled) {
    const refreshBtn = page.getByRole('button', { name: /^refresh$/i });
    if (await refreshBtn.count()) {
      await refreshBtn.click();
      await page.waitForTimeout(1200);
      isDisabled = await sendBtn.isDisabled().catch(() => true);
    }
  }
  test.skip(isDisabled, 'no MISSING requirements available even after refresh');

  await sendBtn.click();
  await expect(page.getByRole('heading', { name: /send upload link\?/i })).toBeVisible();
  await shot(page, 'e2e__upload-link-02-confirm');

  await page.getByRole('button', { name: /^send email$/i }).click();

  // Info banner shows the URL. Match the mono paragraph whose text
  // actually looks like our upload URL (contains `/upload/`).
  const urlLocator = page.locator('p.font-mono').filter({ hasText: '/upload/' }).first();
  await expect(urlLocator).toBeVisible({ timeout: 10_000 });
  const rawUrl = (await urlLocator.textContent())?.trim();
  test.skip(!rawUrl, 'no URL surfaced');
  if (!rawUrl) return;
  console.log(`[upload-link-flow] captured URL: ${rawUrl}`);
  await shot(page, 'e2e__upload-link-03-after-send');

  // ── PUBLIC: open the URL in an anonymous context (no auth cookies).
  const anon = await browser.newContext();
  const publicPage = await anon.newPage();
  await publicPage.goto(rawUrl, { waitUntil: 'networkidle' });
  await expect(
    publicPage.getByRole('heading', { name: /please upload your documents/i }),
  ).toBeVisible();
  await publicPage.setViewportSize({ width: 1440, height: 900 });
  await publicPage.screenshot({
    path: path.join(SHOTS, 'e2e__upload-link-04-public-page.png'),
    fullPage: true,
  });

  // At least one requirement row should have a "Choose file" trigger.
  await expect(publicPage.getByLabel(/choose file/i).first()).toBeVisible();

  // ── Invalid-token screen: any garbage token → "no longer valid".
  await publicPage.goto(`${new URL(rawUrl).origin}/upload/definitely-not-a-real-token`, {
    waitUntil: 'networkidle',
  });
  await expect(publicPage.getByText(/no longer valid/i)).toBeVisible();
  await publicPage.screenshot({
    path: path.join(SHOTS, 'e2e__upload-link-05-invalid.png'),
    fullPage: true,
  });

  await anon.close();

  // ── STAFF: back on the profile, the link should show as ACTIVE in
  // the link history and "Send upload link" is disabled.
  await page.goto(profileUrl, { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: /^documents$/i }).click();
  await expect(page.getByText(/link already active/i)).toBeVisible();
  await expect(page.getByText(/link history/i)).toBeVisible();
  await shot(page, 'e2e__upload-link-06-active-history');
});
