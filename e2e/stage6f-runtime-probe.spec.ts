import { expect, test } from '@playwright/test';

/**
 * Stage 6F Phase 1 — runtime-error probe. Walks the five main pages the
 * product owner's recording touched and reports every console error,
 * page error, failed request, and visible Next.js dev-error overlay so
 * I know what's actually crashing before trying to redesign anything.
 *
 * ADMIN session via the shared storage state. One test; reports all
 * findings as soft assertions so a single bad page doesn't short-
 * circuit the whole probe.
 */

type Finding = { url: string; kind: string; message: string };

async function probe(page: import('@playwright/test').Page, path: string, findings: Finding[]) {
  const errors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];

  const onConsole = (msg: import('@playwright/test').ConsoleMessage) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // Benign React 19 dev warning when base-ui TabsPanel attributes
    // differ between SSR and hydration; the subtree is regenerated
    // automatically and the UI functions normally. Not a production
    // issue.
    if (
      text.includes("A tree hydrated but some attributes of the server rendered HTML didn't match")
    )
      return;
    errors.push(text);
  };
  const onPageErr = (err: Error) => {
    pageErrors.push(err.message);
  };
  const onReqFail = (req: import('@playwright/test').Request) => {
    const url = req.url();
    if (url.includes('/_next/') && url.includes('.map')) return; // ignore sourcemap 404s
    failedRequests.push(`${req.method()} ${url} — ${req.failure()?.errorText ?? 'failed'}`);
  };

  page.on('console', onConsole);
  page.on('pageerror', onPageErr);
  page.on('requestfailed', onReqFail);

  await page.goto(path, { waitUntil: 'networkidle' }).catch(() => {});
  // Give Turbopack HMR a moment to flush any delayed overlays.
  await page.waitForTimeout(1500);

  // Only report the dev overlay when it's actively showing a count of
  // issues. The Next.js dev toast shell is always in the DOM; the
  // issue-count label (e.g. "1 Issue") only renders when there's a
  // real error. Any non-empty text inside the shell constitutes a real
  // finding.
  const shell = page.locator('[data-nextjs-toast]');
  const text = (
    await shell
      .first()
      .innerText()
      .catch(() => '')
  ).trim();
  if (text.length > 0) {
    findings.push({
      url: path,
      kind: 'dev-overlay',
      message: text.slice(0, 500),
    });
  }
  for (const e of errors)
    findings.push({ url: path, kind: 'console-error', message: e.slice(0, 500) });
  for (const e of pageErrors)
    findings.push({ url: path, kind: 'page-error', message: e.slice(0, 500) });
  for (const r of failedRequests)
    findings.push({ url: path, kind: 'req-failed', message: r.slice(0, 500) });

  page.off('console', onConsole);
  page.off('pageerror', onPageErr);
  page.off('requestfailed', onReqFail);
}

test('stage 6F — runtime error probe across main pages', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  // Seed one convertible lead so /clients/[personId] has something to show.
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: '.env.local' });
  const { eq } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const { persons, candidateProfiles } = await import('../src/lib/db/schema/persons');
  const [p] = await db
    .insert(persons)
    .values({
      firstName: 'Probe',
      lastName: `Walk-${Math.random().toString(36).slice(2, 6)}`,
      email: `probe-${Date.now()}@example.test`,
      phone: '+27821234567',
      currentCity: 'Cape Town',
      currentCountry: 'South Africa',
      source: 'DIRECT',
    })
    .returning({ id: persons.id });
  if (!p) throw new Error('seed failed');
  await db.insert(candidateProfiles).values({ personId: p.id });

  const findings: Finding[] = [];
  try {
    for (const path of [
      '/leads?assigned=all',
      '/candidates?assigned=all&view=grid',
      '/candidates?assigned=all&view=table',
      `/clients/${p.id}`,
      `/clients/${p.id}?tab=profile`,
      `/clients/${p.id}?tab=documents-candidate`,
      `/clients/${p.id}?tab=billing`,
      `/clients/${p.id}?tab=applications`,
      `/clients/${p.id}?tab=activity`,
      // Legacy tab bookmark — should redirect-equivalent to Billing.
      `/clients/${p.id}?tab=documents`,
      '/payments',
      '/documents',
    ]) {
      await probe(page, path, findings);
    }
  } finally {
    await db.delete(candidateProfiles).where(eq(candidateProfiles.personId, p.id));
    await db.delete(persons).where(eq(persons.id, p.id));
  }

  // Pretty-print findings so the test output is immediately actionable.
  if (findings.length > 0) {
    console.log('\n──── Stage 6F runtime findings ────');
    for (const f of findings) console.log(`[${f.kind}] ${f.url}\n  ${f.message}\n`);
    console.log(`──── ${findings.length} finding(s) total ────\n`);
  }

  // Soft assertion so the test reports but doesn't halt the probe.
  expect.soft(findings).toEqual([]);
});
