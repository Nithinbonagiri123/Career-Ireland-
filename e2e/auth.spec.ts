import { expect, test } from '@playwright/test';

/**
 * Authenticated auth flows (runs under the "admin" Playwright project, so the
 * browser starts with the seeded admin session cookie).
 *
 * Covered:
 *  - Account → Security page is reachable from the sidebar
 *  - Change-password validates: current wrong, new too short, new mismatched
 *  - Sign-out kills the session and future requests redirect to /login
 */

test('authenticated user reaches /account/security via the sidebar Account section', async ({
  page,
}) => {
  await page.goto('/dashboard');
  // Sidebar link is only present when logged in.
  const securityLink = page.getByRole('link', { name: 'Security', exact: true });
  await expect(securityLink).toBeVisible();
  await securityLink.click();
  await page.waitForURL(/\/account\/security/);
  // The page's h1 is "Security" — CardTitle inside is a div, not a heading.
  await expect(page.getByRole('heading', { level: 1, name: 'Security' })).toBeVisible();
  await expect(page.getByLabel(/current password/i)).toBeVisible();
});

test('change-password requires the correct current password', async ({ page }) => {
  await page.goto('/account/security');
  await page.getByLabel(/current password/i).fill('wrong-current-xyz');
  await page.getByLabel(/^new password$/i).fill('BrandNew-Passphrase-42');
  await page.getByLabel(/confirm new password/i).fill('BrandNew-Passphrase-42');
  await page.getByRole('button', { name: /change password/i }).click();

  // Server-side ValidationError maps back into the currentPassword field.
  const currentField = page.getByLabel(/current password/i);
  await expect(currentField).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText(/current password is incorrect/i)).toBeVisible();
  // We must NOT have navigated to /login (change didn't happen).
  await expect(page).toHaveURL(/\/account\/security/);
});

test('change-password rejects short new password (client-side)', async ({ page }) => {
  await page.goto('/account/security');
  await page.getByLabel(/current password/i).fill('anything');
  await page.getByLabel(/^new password$/i).fill('abc');
  await page.getByLabel(/confirm new password/i).fill('abc');
  await page.getByRole('button', { name: /change password/i }).click();

  await expect(page).toHaveURL(/\/account\/security/);
  // The new-password field is marked invalid and its own role=alert message appears.
  await expect(page.getByLabel(/^new password$/i)).toHaveAttribute('aria-invalid', 'true');
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: /at least 12 characters/i })
      .first(),
  ).toBeVisible();
});

test('change-password rejects mismatched confirm (client-side)', async ({ page }) => {
  await page.goto('/account/security');
  await page.getByLabel(/current password/i).fill('anything');
  await page.getByLabel(/^new password$/i).fill('BrandNew-Passphrase-42');
  await page.getByLabel(/confirm new password/i).fill('BrandNew-Passphrase-99');
  await page.getByRole('button', { name: /change password/i }).click();

  await expect(page).toHaveURL(/\/account\/security/);
  await expect(page.getByText(/do not match/i)).toBeVisible();
});

test('sign-out redirects to /login and future protected requests are unauthenticated', async ({
  page,
}) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard/);

  // Open the account dropdown by clicking the avatar trigger.
  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByRole('menuitem', { name: /sign out/i }).click();

  await page.waitForURL(/\/login/, { timeout: 15_000 });

  // Follow-up protected request must redirect back to /login.
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/);
});
