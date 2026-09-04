import { expect, test } from '@playwright/test';
import { E2E_ADMIN } from './global-setup';

/**
 * Anonymous auth flows. Uses the "anonymous" Playwright project (no stored
 * session cookie), so every test starts logged out.
 *
 * Covered:
 *  - Unauthenticated users are redirected to /login with callbackUrl set
 *  - /login is publicly reachable
 *  - /login/forgot is publicly reachable and shows the admin contact
 *  - Login with wrong password shows an error and stays on /login
 *  - Login with correct password lands on /dashboard
 *  - Open-redirect defense: ?callbackUrl=https://evil.com/x → /dashboard
 *  - Open-redirect defense: ?callbackUrl=//evil.com/x   → /dashboard
 *  - Open-redirect defense: ?callbackUrl=/valid/path    → /valid/path
 */

test('unauthenticated request to /dashboard redirects to /login with callbackUrl', async ({
  page,
}) => {
  const response = await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fdashboard/);
  expect(response?.status()).toBeLessThan(400);
});

test('login page is publicly reachable', async ({ page }) => {
  const r = await page.goto('/login');
  expect(r?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
});

test('forgot page is publicly reachable and shows the admin contact', async ({ page }) => {
  const r = await page.goto('/login/forgot');
  expect(r?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: /forgot your password/i })).toBeVisible();
  // Contact address is rendered somewhere on the page.
  await expect(page.getByText('@', { exact: false })).toBeVisible();
});

test('login with wrong password stays on /login and shows an error', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(E2E_ADMIN.email);
  await page.getByLabel(/password/i).fill('definitely-wrong-password-xyz');
  await page.getByRole('button', { name: 'Login', exact: true }).click();

  // The action returns fail() and the client renders an alert — the page must
  // NOT navigate away from /login.
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('alert')).toBeVisible();
});

test('login with correct password lands on /dashboard', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(E2E_ADMIN.email);
  await page.getByLabel(/password/i).fill(E2E_ADMIN.password);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL(/\/dashboard/);
  await expect(page).toHaveURL(/\/dashboard/);
});

test('open-redirect defense: absolute external callbackUrl is ignored', async ({ page }) => {
  await page.goto('/login?callbackUrl=https%3A%2F%2Fevil.com%2Ffake');
  await page.getByLabel(/email/i).fill(E2E_ADMIN.email);
  await page.getByLabel(/password/i).fill(E2E_ADMIN.password);
  await page.getByRole('button', { name: 'Login', exact: true }).click();

  await page.waitForURL(/\/dashboard/);
  // Must be on same origin, not evil.com.
  const url = new URL(page.url());
  expect(url.hostname).toMatch(/localhost|127\.0\.0\.1/);
  expect(url.pathname).toBe('/dashboard');
});

test('open-redirect defense: protocol-relative callbackUrl is ignored', async ({ page }) => {
  await page.goto('/login?callbackUrl=%2F%2Fevil.com%2Ffake');
  await page.getByLabel(/email/i).fill(E2E_ADMIN.email);
  await page.getByLabel(/password/i).fill(E2E_ADMIN.password);
  await page.getByRole('button', { name: 'Login', exact: true }).click();

  await page.waitForURL(/\/dashboard/);
  const url = new URL(page.url());
  expect(url.hostname).toMatch(/localhost|127\.0\.0\.1/);
  expect(url.pathname).toBe('/dashboard');
});

test('safe callbackUrl (same-origin absolute path) is honoured', async ({ page }) => {
  await page.goto('/login?callbackUrl=%2Fcandidates');
  await page.getByLabel(/email/i).fill(E2E_ADMIN.email);
  await page.getByLabel(/password/i).fill(E2E_ADMIN.password);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL(/\/candidates/);
  await expect(page).toHaveURL(/\/candidates/);
});
