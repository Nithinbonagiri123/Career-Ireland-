import { expect, test } from '@playwright/test';

/**
 * Coverage for the candidate-onboarding workflow:
 *   - entry surface (button + section rendering + disabled Create button)
 *   - full happy path (fill form → Create → success card → invoice → receipt)
 *
 * The happy path depends on:
 *   - baseline currencies (EUR seeded by e2e/global-setup.ts)
 *   - the CANDIDATE_ONBOARDING catalog item, auto-bootstrapped by finaliseDraft
 * so the spec is self-contained apart from the admin session cookie the
 * global setup writes to playwright/.auth/admin.json.
 */

test('add-candidate button is visible on /candidates', async ({ page }) => {
  await page.goto('/candidates');
  await expect(page.getByRole('link', { name: /add candidate/i })).toBeVisible();
});

test('add-candidate lands on /candidates/new with a draft id and renders all sections', async ({
  page,
}) => {
  await page.goto('/candidates');
  await page.getByRole('link', { name: /add candidate/i }).click();
  await page.waitForURL(/\/candidates\/new\?draft=[0-9a-f-]+/i);

  await expect(page.getByRole('heading', { name: /add candidate/i })).toBeVisible();
  await expect(page.getByText(/personal & contact/i)).toBeVisible();
  await expect(page.getByText(/cover letter/i).first()).toBeVisible();
  await expect(page.getByText(/^documents$/i).first()).toBeVisible();
  // "Payment *" heading — asterisk marks it required.
  await expect(page.getByText(/^payment/i).first()).toBeVisible();

  await expect(page.getByLabel(/first name/i)).toBeVisible();
  await expect(page.getByLabel(/last name/i)).toBeVisible();
  await expect(page.getByLabel(/^amount/i)).toBeVisible();
});

test('sticky Create button is disabled until required fields are filled', async ({ page }) => {
  await page.goto('/candidates/new');
  await page.waitForURL(/\/candidates\/new\?draft=[0-9a-f-]+/i);

  const create = page.getByRole('button', { name: /create candidate/i });
  await expect(create).toBeDisabled();

  await page.getByLabel(/first name/i).fill('Priya');
  await page.getByLabel(/last name/i).fill('Patel');
  await page.getByLabel(/^amount/i).fill('750.00');
  // receivedAt already prefilled with today; currency defaults to EUR.

  await expect(create).toBeEnabled();
});

test('full happy path: fill form → Create → open invoice and receipt', async ({ page }) => {
  // Unique surname per run so the candidate is easy to identify in the DB if a
  // failed test leaves rows behind. finaliseDraft is idempotent-safe: each
  // Playwright run starts a fresh draft, so re-running the spec creates a new
  // person + invoice rather than colliding on a unique key.
  const suffix = Date.now().toString(36).slice(-6);
  const firstName = 'Priya';
  const lastName = `E2E-${suffix}`;
  const cvFilename = `cv-${suffix}.pdf`;

  await page.goto('/candidates/new');
  await page.waitForURL(/\/candidates\/new\?draft=[0-9a-f-]+/i);

  await page.getByLabel(/first name/i).fill(firstName);
  await page.getByLabel(/last name/i).fill(lastName);
  await page.getByLabel(/^amount/i).fill('750.00');
  // Currency + received-on come prefilled (EUR, today).

  // Upload a document straight from the form. The DocumentUploader hides the
  // real <input type="file"> for styling — we drive it via setInputFiles to
  // bypass the label click that would open a native chooser. The CV doc type
  // is seeded by e2e/global-setup.ts and is the only PERSON-applicable one,
  // so the default select value is already correct.
  //
  // The upload step is gated on E2E_SKIP_UPLOAD so it can be turned off on
  // laptops without Docker/MinIO running. CI's e2e job (ci.yml) leaves the
  // var unset, so the upload path IS covered on every PR.
  if (!process.env.E2E_SKIP_UPLOAD) {
    const fakePdf = Buffer.concat([
      Buffer.from('%PDF-1.4\n', 'ascii'),
      Buffer.alloc(64, 0),
      Buffer.from('\n%%EOF\n', 'ascii'),
    ]);
    await page.locator('input[type="file"]').setInputFiles({
      name: cvFilename,
      mimeType: 'application/pdf',
      buffer: fakePdf,
    });
    // Wait for the presign + S3 PUT + register roundtrip to finish. The row
    // appears in the "Attached" list once the state flips to `ok`.
    await expect(page.getByText(cvFilename)).toBeVisible({ timeout: 15_000 });
  }

  // handleCreate() flushes any in-flight debounced save before finalising, so
  // there's no need to wait for the "Saved" indicator — Create is the sync
  // boundary that guarantees the personal patch reaches the DB first.
  await page.getByRole('button', { name: /create candidate/i }).click();

  // Redirect to /candidates/<id>?just_created=1 on success. The detail page
  // streams its content through Suspense (loading.tsx renders a skeleton),
  // so we wait for the streaming to finish by looking for the newly created
  // candidate's name in the H1 rather than for the Sonner toast, which
  // appears earlier and would match /candidate created/i falsely.
  await page.waitForURL(/\/candidates\/[0-9a-f-]+\?just_created=1/i, { timeout: 15_000 });
  await expect(
    page.getByRole('heading', { name: new RegExp(`${firstName} ${lastName}`, 'i') }),
  ).toBeVisible({ timeout: 15_000 });

  // Success card renders "View invoice" + "View receipt" links.
  const viewInvoice = page.getByRole('link', { name: /view invoice/i });
  const viewReceipt = page.getByRole('link', { name: /view receipt/i });
  await expect(viewInvoice).toBeVisible();
  await expect(viewReceipt).toBeVisible();

  // Follow the invoice link — the print page shows the invoice number in
  // its header, and the header itself reads "Invoice".
  await viewInvoice.click();
  await page.waitForURL(/\/candidates\/[0-9a-f-]+\/invoices\/INV-\d{4}-\d{6}/i);
  await expect(page.getByText(/^invoice$/i).first()).toBeVisible();
  // The success toast that fired on Create can persist ~4s and it also
  // contains the invoice number ("Candidate created — INV-…"), so pin
  // the assertion to the first match (the invoice header) rather than
  // any random element that happens to contain the string.
  await expect(page.getByText(/INV-\d{4}-\d{6}/).first()).toBeVisible();
  // Bill-to line shows the candidate we just created. The exact name also
  // appears embedded in the line-description ("Candidate Onboarding —
  // <name>"), so use exact-match to pin to the Bill-to <div>.
  await expect(page.getByText(`${firstName} ${lastName}`, { exact: true })).toBeVisible();

  // History back returns us to /candidates/<id>?just_created=1 with the
  // success card still mounted — the invoice page's "Back to candidate" link
  // strips the query string, so goBack() is the reliable path.
  await page.goBack();
  await page.waitForURL(/\/candidates\/[0-9a-f-]+\?just_created=1/i);
  await page.getByRole('link', { name: /view receipt/i }).click();
  await page.waitForURL(/\/candidates\/[0-9a-f-]+\/receipts\/RCT-\d{4}-\d{6}/i);
  await expect(page.getByText(/^receipt$/i).first()).toBeVisible();
  await expect(page.getByText(/RCT-\d{4}-\d{6}/).first()).toBeVisible();
});
