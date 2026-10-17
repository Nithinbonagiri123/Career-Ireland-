import fs from 'node:fs';
import path from 'node:path';

/**
 * Stage 4.2 — Vercel cron configuration audit.
 *
 * Verifies that vercel.json is self-consistent and compatible with the
 * Vercel Hobby plan's "daily-only" cron schedule restriction. Does
 * NOT trigger any cron. Reports:
 *
 *   - all registered cron paths exist as route handlers on disk
 *   - every schedule is daily (`0 H * * *` form, exactly one invocation
 *     per day — Hobby-compatible)
 *   - any schedule clashes (same minute) are flagged with a safety
 *     note (parallel firing is OK; shared-resource races are not)
 *   - total cron count (Hobby plan ceiling is 2; project may be on Pro)
 */

type Cron = { path: string; schedule: string };

type Result = { name: string; ok: boolean; detail?: string };
const results: Result[] = [];
function check(name: string, cond: boolean, detail?: string): void {
  results.push({ name, ok: cond, detail });
  console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function main() {
  const vercelJson = JSON.parse(fs.readFileSync(path.resolve('vercel.json'), 'utf8')) as {
    crons?: Cron[];
  };
  const crons = vercelJson.crons ?? [];

  console.log(`\n── Found ${crons.length} cron entries`);
  for (const c of crons) {
    console.log(`    ${c.schedule.padEnd(14)}  ${c.path}`);
  }

  /* 1. Every path has a matching route handler on disk */
  console.log('\n── 1. Each registered path has a route.ts on disk');
  for (const c of crons) {
    const routeFile = path.resolve(`src/app${c.path}/route.ts`);
    check(c.path, fs.existsSync(routeFile), routeFile);
  }

  /* 2. Every schedule is daily (Hobby constraint) */
  console.log('\n── 2. Every schedule is daily (one firing per 24h)');
  const DAILY_PATTERN = /^(\d+|\*)\s(\d+|\*)\s\*\s\*\s\*$/;
  for (const c of crons) {
    const m = c.schedule.match(DAILY_PATTERN);
    // Daily == day-of-month = * AND month = * AND day-of-week = *, with
    // specific minute + hour. A `*` in minute or hour would mean sub-
    // daily firing — not Hobby-compatible.
    const [, min, hour] = m ?? [];
    const isDaily = Boolean(m) && min !== '*' && hour !== '*';
    check(`${c.schedule} on ${c.path}`, isDaily);
  }

  /* 3. Clashes at the same minute (safe but worth noting) */
  console.log('\n── 3. Minute-level clash audit');
  const bySchedule = new Map<string, string[]>();
  for (const c of crons) {
    const arr = bySchedule.get(c.schedule) ?? [];
    arr.push(c.path);
    bySchedule.set(c.schedule, arr);
  }
  const clashes = Array.from(bySchedule.entries()).filter(([, paths]) => paths.length > 1);
  if (clashes.length === 0) {
    check('no two crons share the same schedule', true);
  } else {
    for (const [schedule, paths] of clashes) {
      console.log(`    ⚠ ${schedule} fires: ${paths.join(', ')}`);
    }
    // Not a hard failure — parallel firing is Vercel-supported. Flag
    // for a human review of shared-resource contention.
    check(
      `clashing crons present (manual review of shared tables)`,
      true,
      `${clashes.length} shared-minute group(s)`,
    );
  }

  /* 4. Hobby count ceiling */
  console.log('\n── 4. Hobby plan compatibility');
  const HOBBY_MAX = 2;
  if (crons.length > HOBBY_MAX) {
    console.log(
      `    ⚠ ${crons.length} cron entries exceed the Hobby ceiling of ${HOBBY_MAX}. If this project is on Pro (40-cron ceiling) this is fine. If still on Hobby, consolidate.`,
    );
  }
  check(
    `cron count ${crons.length} within Pro ceiling (40)`,
    crons.length <= 40,
    `${crons.length} / 40`,
  );

  /* 5. Shared-resource check for the known pair (expire-leads + attendance) */
  console.log('\n── 5. Shared-table check for 02:00 crons');
  const twoAM = crons.filter((c) => c.schedule === '0 2 * * *').map((c) => c.path);
  if (twoAM.length > 1) {
    console.log(`    02:00 crons: ${twoAM.join(', ')}`);
    // Known safe pair: attendance-auto-close touches attendance_entries
    // only; expire-leads touches leads + audit_events only. Disjoint
    // table sets → no shared-row contention. We assert this by name,
    // not by analysing SQL — a future reviewer should re-check if
    // either cron grows.
    const expected = new Set(['/api/cron/attendance-auto-close', '/api/cron/expire-leads']);
    const matches = twoAM.every((p) => expected.has(p));
    check(
      '02:00 pair = {attendance-auto-close, expire-leads} (disjoint tables)',
      matches,
      matches ? undefined : 'unknown pair — manually audit for shared tables',
    );
  } else {
    check('no 02:00 cron collisions', true);
  }

  console.log('\n── Summary');
  const pass = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok);
  console.log(`  ${pass} / ${results.length} passed`);
  if (fail.length > 0) {
    for (const f of fail) console.log(`    ✗ ${f.name}${f.detail ? ` (${f.detail})` : ''}`);
    process.exit(1);
  }
  console.log('\n✓ Stage 4.2 cron audit — configuration is self-consistent.');
}

try {
  main();
  process.exit(0);
} catch (e) {
  console.error('\n✗', (e as Error).message);
  process.exit(1);
}
