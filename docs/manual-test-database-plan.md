# Isolated local manual-testing database (Decision 8)

> **Status (2026-10-31, Europe/Dublin):** the owner approved an isolated LOCAL manual-testing
> environment in principle. The **guards and scripts are implemented** in the working tree
> (§8). **Nothing has been created or run against a manual database**: no database was created,
> no migration was applied, no worktree was created, no `.env*` file was opened, created or
> edited, and the dev server on :3000 was not touched. Creating the schema requires running
> migrations, which needs separate owner approval — the exact command list awaiting approval
> is in §9.
>
> Sections 1–7 are the original plan (prepared by workstream W5, Recruitment P0). Where §8/§9
> differ from them, §8/§9 win.

## 1. Why

Today, manual clicking, Vitest DB tests, Playwright specs and seed scripts all share **one local
database**. Automated tests create and delete fixtures, reset the E2E users' passwords, and
rewrite the STAFF test user's permissions on every run. Manual test records (the R5 records, the
`MT-AUDIT` records) sit next to that churn. A separate database for manual testing keeps
hand-made scenarios stable and keeps automated runs from ever seeing or changing them.

**Nothing in this plan deletes or moves anything from the current database.** The R5 and
`MT-AUDIT` records stay where they are. The manual database is either empty plus reference data
(option A), or a *copy* (option B). The copy is made with a read-only dump of the source.

## 2. What connects to which database today

This section uses committed code and config only. `.env.local` was **not inspected, by policy**.

| Consumer | How it finds the DB | Guard today | Source |
|---|---|---|---|
| App runtime (`next dev`, `next start`) | `env.DATABASE_URL`, validated as a URL by Zod. Next loads `.env.local`, but a variable already set in `process.env` **wins** (Next env load order: `process.env` → `.env.$NODE_ENV.local` → `.env.local` → …). | none (any URL) | `src/lib/env.ts:4`, `src/lib/db/client.ts:25-31`, `node_modules/next/dist/docs/01-app/02-guides/environment-variables.md` "Environment Variable Load Order" |
| Dev server | `pnpm dev` = `next dev --turbopack -H 127.0.0.1`. Port 3000 by default. Build output goes to `.next/dev`, with a lock file at `.next/dev/lock`. | — | `package.json` scripts; `ls .next/dev` |
| Migrations | `pnpm db:migrate` → `tsx src/lib/db/migrate.ts`. Loads `.env.local` with dotenv, which **does not override** a `DATABASE_URL` that is already exported. Runs the Drizzle migrator over `src/lib/db/migrations` (tracking table `__drizzle_migrations`) and creates `citext`. | none | `src/lib/db/migrate.ts:6-24` |
| drizzle-kit (`db:generate`, `db:studio`) | `drizzle.config.ts` loads `.env.local`, then `process.env.DATABASE_URL`. | none | `drizzle.config.ts:4-11` |
| **Vitest** (DB-backed tests) | `vitest.setup.ts` loads `.env.local`, so tests use the **same DB as the dev server**. | **none at all** | `vitest.setup.ts:4`, `vitest.config.ts` |
| Playwright runner + 65 specs that import `@/lib/db/client` directly | `e2e/global-setup.ts` loads `.env.local`. The worker processes inherit it, so spec fixtures are written straight to that DB. | `assertLocalDatabase()` checks the **host only** (localhost / 127.0.0.1 / ::1) | `e2e/global-setup.ts:6,26-39` |
| Playwright target server | `PLAYWRIGHT_BASE_URL`, default `http://localhost:3000`. `webServer: { command: 'pnpm dev', reuseExistingServer: true }` **reuses whatever is listening on :3000**. | none | `playwright.config.ts:3,88-95` |
| Playwright global setup side effects | Upserts EUR/USD/GBP and the CV document type. Upserts `e2e-admin@…` (resets password; may set `is_owner`) and `e2e-staff@…` (resets password, **deletes and re-inserts that user's `user_permissions`**). Logs both in through the UI and saves `playwright/.auth/{admin,staff}.json`. | host-only | `e2e/global-setup.ts:77-240` |
| Test wrapper `scratchpad/pw-locked.sh` | Takes a cross-agent lock, `cd`s into the repo, **sources a credentials env file** (`scratchpad/local-test-credentials.env`, which holds the E2E test-user passwords; *not opened*), then runs the repo's Playwright config. So it inherits `.env.local`'s DB and `:3000`. | lock only | the wrapper script |
| Destructive or test seed scripts: `seed-e2e-admin`, `seed-e2e-minimal`, `reset-data`, `reset-admin-password`, `set-owner`, `grant-e2e-admin-perms`, `seed-billing-fixtures`, `seed-realistic` | `.env.local` | `scripts/_assert-local-db.ts`: **host-only** local check. No override flag. | `scripts/_assert-local-db.ts:12-34` |
| Reference seeds: `db:seed:currencies`, `:services`, `:service-categories`, `:document-types`, `:accounting`, `:skills`; `db:seed:admin` (interactive first admin) | `.env.local` (some via `scripts/_bootstrap-env.ts`, which fills placeholder service keys only when they are unset) | none (all idempotent upserts) | `scripts/seed-*.ts`, `scripts/_bootstrap-env.ts` |
| Staging bootstrap | `STAGING_DATABASE_URL` must equal `DATABASE_URL`. An identity handshake checks `STAGING_DB_EXPECTED_HOST` / `_NAME` against the URL **and** `current_database()`, plus a `__staging_marker` row. | strong (a good model) | `scripts/staging/guard-staging-db.ts`, `scripts/staging/_assert-staging.ts` |
| CI | An ephemeral `postgres:16-alpine` service container on `localhost:5432`, database name `ci` (committed in `ci.yml`). Runs migrate → seeds → `pnpm test` → `pnpm test:e2e`. Workflows: `CI` (`ci.yml`), `Deploy` (`deploy.yml`), `Promote to production` (`promote-production.yml`). | throwaway DB | `.github/workflows/*` (names only) |
| Object storage (dev) | MinIO from `docker-compose.yml`, bound to `127.0.0.1:9000` (API) and `:9001` (console). Bucket `career-ireland-documents-dev`. There is no Postgres in compose. | — | `docker-compose.yml` |

**Observed facts, not from config files:**
- A host Postgres (not Docker) is listening on `127.0.0.1:5432` and `[::1]:5432` (from `lsof`).
- A read-only query through the app's own client (Task D) returned `current_database()` =
  `ireland_careers_dev`, size about 38 MB. It holds 1,194 persons, 85 employers, 91 requisitions,
  505 candidate matches, 498 invoices and 22,036 audit events.
- Port 3000 is the running dev server, bound to 127.0.0.1. Other local Node servers occupy
  3200, 3250, 3300 and 6543 (not this project's dev server; leave them alone).

**Defined in `.env.local` (not inspected, by policy).** The owner should check these themselves:
1. `DATABASE_URL`: user, host, port and database name (expected `ireland_careers_dev` on
   127.0.0.1:5432).
2. `AUTH_URL`: probably `http://localhost:3000`. The manual server needs its own value.
3. `AUTH_SECRET`: the manual server should use a **different** secret (see §4.4).
4. `S3_ENDPOINT` / `S3_BUCKET_DOCUMENTS`: the app reported `S3_ENDPOINT` is
   `http://localhost:9000` (MinIO). Decide whether manual uploads share the dev bucket.
5. `E2E_ADMIN_PASSWORD` / `E2E_STAFF_PASSWORD`: should **not** be copied to the manual env.
6. `MAIL_PROVIDER`: should stay `console` (the default) for the manual server.

## 3. Proposed isolation procedure (owner actions, after approval)

### 3.1 Choose the shape

| Option | What you get | Trade-off |
|---|---|---|
| **A (recommended): fresh schema plus reference data** | Empty business data, the same schema as dev, catalogue/currencies/occupations present | Manual scenarios start clean. You create your own employers and candidates. |
| B: copy of today's dev data | Everything, including R5 and `MT-AUDIT` (as copies) | Inherits test clutter and E2E users. A one-off `pg_dump` of the dev DB (read-only on the source). Larger. |

`CREATE DATABASE … TEMPLATE ireland_careers_dev` is **not** recommended. Postgres requires no
other sessions on the template, so it would mean stopping the dev server and every agent.

### 3.2 Run the manual server from a separate git worktree

A second `next dev` in the same checkout would fight over `.next/dev` and its lock file
(`.next/dev/lock`). It would also have to share `.env.local`. A separate worktree has its own
`.next`, its own `.env.local`, and nothing in the main tree changes:

```bash
# from the main checkout — creates a sibling folder, does not touch this tree's files
git worktree add ../ireland-careers-manual main
cd ../ireland-careers-manual
pnpm install --frozen-lockfile        # uses the pnpm store; no dependency changes
```

The owner then creates `../ireland-careers-manual/.env.local` **by hand**: copy the dev one
and change only the lines below. The worktree's `.env.local` is git-ignored and never committed.

```dotenv
DATABASE_URL=postgres://<same local user>@127.0.0.1:5432/ireland_careers_manual
AUTH_URL=http://127.0.0.1:3001
AUTH_SECRET=<a NEW random 32+ char value — not the dev one>
S3_BUCKET_DOCUMENTS=career-ireland-documents-manual   # optional, see 3.6
MAIL_PROVIDER=console
# do NOT add E2E_ADMIN_PASSWORD / E2E_STAFF_PASSWORD here
```

Alternative without a worktree: `DATABASE_URL=… AUTH_URL=… AUTH_SECRET=… pnpm exec next start -p 3001 -H 127.0.0.1`
against a production build. That needs a build and production-only env vars (`CRON_SECRET`,
`MAIL_FROM`, a non-console mailer, a non-loopback `S3_ENDPOINT`), so the worktree is simpler.

### 3.3 Create the database (owner, local superuser)

```bash
createdb -h 127.0.0.1 -p 5432 ireland_careers_manual
psql -h 127.0.0.1 -d ireland_careers_manual -c \
  "COMMENT ON DATABASE ireland_careers_manual IS 'icg:manual-testing — never run automated tests here'"
```

The `COMMENT ON DATABASE` is a label stored in the Postgres catalogue. It is **not** a table, so
the app schema is unchanged. The guards in §4 can read it.

### 3.4 Apply the schema with the existing tooling, against that DB only

Run this inside the manual worktree, so the worktree's `.env.local` points at the manual DB.
For extra safety, export the URL explicitly. dotenv never overrides an exported variable.

```bash
cd ../ireland-careers-manual
export DATABASE_URL='postgres://<user>@127.0.0.1:5432/ireland_careers_manual'
psql "$DATABASE_URL" -tAc 'select current_database()'   # must print ireland_careers_manual
pnpm db:migrate                                          # drizzle migrator, same files as dev
```

Do **not** use `drizzle-kit push`, and do not run `scripts/ci/apply-migrations.sh` (that one is
the production path with its own `__ic_migrations` table).

### 3.5 Seed reference data (option A)

All of these are idempotent upserts. Run them in the same shell, with `DATABASE_URL` exported:

```bash
pnpm db:seed:currencies
pnpm db:seed:service-categories
pnpm db:seed:services
pnpm db:seed:document-types
pnpm db:seed:accounting
pnpm db:seed:skills
pnpm db:seed:admin          # interactive: creates the first ADMIN for manual use
```

Occupations have no seed script (`seed-realistic.ts` reads them from an existing DB). To copy
the reference tables only, do a read-only dump from dev and restore it into manual:

```bash
pg_dump -h 127.0.0.1 -d ireland_careers_dev --data-only \
  -t occupation_categories -t occupations -t qualifications \
  | psql -h 127.0.0.1 -d ireland_careers_manual
```

(Check the exact table names with `\dt` first. The dump only reads from dev.)

**Never run** these against the manual DB: `seed-e2e-admin`, `seed-e2e-minimal`, `reset-data`,
`set-owner`, `reset-admin-password`, `grant-e2e-admin-perms`, `seed-billing-fixtures`,
`seed-realistic`.

Option B instead: `pg_dump -Fc ireland_careers_dev > dev.dump`, then `pg_restore -d
ireland_careers_manual dev.dump`. Afterwards, deactivate the E2E users in the copy so a stray
test login cannot succeed there.

### 3.6 Uploads (optional)

The manual server shares MinIO. Either accept a shared dev bucket (object keys are unique, so
they won't collide), or create `career-ireland-documents-manual` in the MinIO console at
`127.0.0.1:9001` and point the worktree's `S3_BUCKET_DOCUMENTS` at it. Do not edit
`docker-compose.yml`.

### 3.7 Start the manual server

```bash
cd ../ireland-careers-manual
pnpm exec next dev --turbopack -H 127.0.0.1 -p 3001
# open http://127.0.0.1:3001   (127.0.0.1, NOT localhost — see 4.4)
```

Superseded: `pnpm dev:manual` now exists (with a preflight) — see §8.3.

## 4. Keeping automated tests away from the manual DB

### 4.1 Rules that need no code

1. **Never edit the main checkout's `.env.local` to point at the manual DB.** The main tree is
   where Vitest, Playwright, `pw-locked.sh` and every seed script run. Its `.env.local` keeps
   pointing at `ireland_careers_dev`.
2. **Never run the manual server on port 3000.** Playwright's `webServer` has
   `reuseExistingServer: true`, so it would silently drive whatever answers on `localhost:3000`.
   Fixture rows would go to the dev DB (from `.env.local`) while the UI clicks went to the
   manual DB.
3. Natural tripwire: Playwright global setup logs in as `e2e-admin@ireland-careers.test`, but
   that user is seeded into the *dev* DB. If `:3000` were ever the manual server, the login would
   fail and the whole run would abort before any spec. This only holds if the E2E users are
   **never** seeded or copied into the manual DB, so deactivate them under option B.
4. Do not run `pnpm test` or `pnpm test:e2e` from the manual worktree. Its `.env.local` points at
   the manual DB.

### 4.2 Proposed guard: Vitest (superseded — see §8)

Add this to `vitest.setup.ts` right after `config({ path: '.env.local' })`. It checks the URL
synchronously, so it works before any test file imports the client:

```ts
// Refuse to run DB-backed tests anywhere except the dev and CI databases.
const TEST_DB_ALLOW = new Set(['ireland_careers_dev', 'ci']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
(() => {
  const raw = process.env.DATABASE_URL;
  if (!raw) return; // pure unit tests without a DB still run
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error('vitest: DATABASE_URL is not a valid URL'); }
  const name = decodeURIComponent(u.pathname.replace(/^\//, ''));
  if (!LOCAL_HOSTS.has(u.hostname.toLowerCase()) || !TEST_DB_ALLOW.has(name)) {
    // never print the URL — it contains credentials
    throw new Error(`vitest refuses to run against database "${name}" on a non-allow-listed target.`);
  }
})();
```

### 4.3 Proposed guard: Playwright global setup and seed scripts (superseded — see §8)

Extend `assertLocalDatabase()` in `e2e/global-setup.ts` and `scripts/_assert-local-db.ts` with a
name allow-list **and** a live identity check. The live check catches aliases and a manual DB
reached through an unexpected URL:

```ts
const E2E_DB_ALLOW = new Set(['ireland_careers_dev', 'ci']);
const MANUAL_LABEL = 'icg:manual-testing';

export async function assertTestDatabase(scriptName: string): Promise<void> {
  const u = new URL(process.env.DATABASE_URL ?? 'invalid:');
  const name = decodeURIComponent(u.pathname.replace(/^\//, ''));
  if (!E2E_DB_ALLOW.has(name)) {
    throw new Error(`${scriptName}: database "${name}" is not an allow-listed test database.`);
  }
  const { default: postgres } = await import('postgres');
  const sql = postgres(process.env.DATABASE_URL as string, { max: 1 });
  try {
    const [row] = await sql`
      select current_database() as db,
             shobj_description(d.oid, 'pg_database') as label
      from pg_database d where d.datname = current_database()`;
    if (row?.db !== name || String(row?.label ?? '').startsWith(MANUAL_LABEL)) {
      throw new Error(`${scriptName}: refusing — connected database is labelled for manual testing.`);
    }
  } finally {
    await sql.end({ timeout: 2 });
  }
}

// Playwright only — refuse to drive the manual server port.
const base = new URL(process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000');
if (base.port === '3001') throw new Error('Playwright must never target the manual-testing server (:3001).');
```

Optional and stronger (it is a code change, so it needs separate approval): a dev-only
`GET /api/dev/db-identity` returning `current_database()` (404 in production). Global setup would
call it and compare the result with its own `DATABASE_URL`, proving the UI server and the
fixture writer share one database.

### 4.4 Sessions must not cross servers

Browser cookies are scoped to the **host, not the port**. `localhost:3000` and `localhost:3001`
share the `authjs.session-token` cookie, and `playwright/.auth/*.json` cookies are stored for
`localhost`. So:
- Open the manual server at **`127.0.0.1:3001`**. A different host means a separate cookie jar.
- Give it a **different `AUTH_SECRET`**. Then a dev session JWT can never be accepted by the
  manual server, or the other way round, even if a cookie leaks across.

## 5. Rollback

1. **Switch back:** stop the manual server (Ctrl-C in the worktree). The main dev server on :3000
   was never changed, so there is nothing to restart. If someone did export `DATABASE_URL` in the
   main shell, open a new shell (or `unset DATABASE_URL`) and restart `pnpm dev` as usual.
2. **Discard the manual DB** (only if unwanted; owner action):
   `dropdb -h 127.0.0.1 -p 5432 --if-exists ireland_careers_manual`. Check the name twice. This
   never touches `ireland_careers_dev`, R5 or `MT-AUDIT`.
3. **Remove the worktree:** `git worktree remove ../ireland-careers-manual` (its `.env.local`
   goes with it), then optionally remove the `career-ireland-documents-manual` bucket in MinIO.

## 6. Verification checklist (after setup)

- [ ] `psql -h 127.0.0.1 -l` lists both `ireland_careers_dev` and `ireland_careers_manual`.
- [ ] In the manual worktree, `psql "$DATABASE_URL" -tAc 'select current_database()'` prints
      `ireland_careers_manual`.
- [ ] `select count(*) from __drizzle_migrations` matches between the two DBs (62 today).
- [ ] The manual server answers on `http://127.0.0.1:3001` and you can log in as the manual admin.
- [ ] The E2E admin **cannot** log in on :3001.
- [ ] Create a marker record on :3001 (e.g. employer "MANUAL-CHECK"). It must **not** appear on
      :3000, and a dev-DB `select count(*) from employers where legal_name like 'MANUAL-CHECK%'`
      returns 0.
- [ ] R5 and `MT-AUDIT` records are still present and unchanged in `ireland_careers_dev` (count
      before and after).
- [ ] Main checkout: `pnpm -s vitest run src/modules/hr/privacy.test.ts` still passes on the dev DB.
      With the §4.2 guard in place, running it with `DATABASE_URL` pointing at the manual DB
      fails immediately with the refusal message.
- [ ] `pw-locked.sh` run of one spec still targets :3000 and passes.
- [ ] Logging in on :3001 does not log you out of :3000 (separate host and secret).

## 7. Decisions needed from the owner

1. Option A (fresh plus reference data) or B (copy)?
2. Approve the worktree approach and port 3001 / host 127.0.0.1?
3. Separate MinIO bucket or shared?
4. Approve applying the Vitest and Playwright/seed guards from §4.2–4.3 (small code change in test
   setup only)?
5. Optional dev-only DB-identity endpoint (§4.3)?

## 8. Implemented guards (in the working tree, uncommitted)

All guard logic lives in one dependency-free module, **`src/lib/db/manual-db-guard.ts`**
(no imports, so Vitest, Playwright config/global setup, tsx scripts and the migrator can all load
it). A database counts as **manual** when its name is exactly `ireland_careers_manual` or ends in
`_manual` (case-insensitive), or — live check — its `COMMENT ON DATABASE` starts with
`icg:manual-testing`. Messages include the database **name** only; the URL is never printed.

### 8.1 Who is refused, and how

| Runner | Check | Override |
|---|---|---|
| Vitest, per test file (`vitest.setup.ts`) | URL name check, synchronous, no DB round-trip | **none** |
| Vitest, once per run (`vitest.global-setup.ts`, wired in `vitest.config.ts`) | URL name **and** one `select current_database(), shobj_description(...)` (catches an aliased/renamed manual DB by its COMMENT). Skipped silently if the DB is unreachable — DB tests then fail on their own. | **none** |
| `playwright.config.ts` (config load — **before** `webServer` runs) | refuses a base URL on port **3001**, so `reuseExistingServer: true` can never silently drive the manual server | **none** |
| `e2e/global-setup.ts` (before any seeding) | port 3001 again, URL name, live identity | **none** |
| Test / destructive seeds via `scripts/_assert-local-db.ts` `assertLocalDatabase()`: `seed-e2e-admin`, `seed-e2e-minimal`, `seed-billing-fixtures`, `seed-realistic`, `reset-data`, `reset-admin-password`, `set-owner`, `grant-e2e-admin-perms` | existing local-host check + manual-DB name check | **none** |
| Walkthrough / repro scripts that write: `repro-task-generator-race`, `stage2-correctness-check`, `stage3-service-walkthrough`, `stage4-safety-checks`, `stage4.1-refund-walkthrough`, `stage4.2-refund-invariants` | manual-DB name check | **none** |
| Migrator `src/lib/db/migrate.ts` (`pnpm db:migrate`, `pnpm db:migrate:manual`) | URL name + live COMMENT label | `ALLOW_MANUAL_DB_MIGRATE=1` |
| Reference / setup seeds via `assertSetupTarget()`: `seed-currencies`, `seed-service-categories`, `seed-services-2026`, `seed-document-types`, `seed-accounting`, `seed-skills`, `seed-admin`; repair scripts `reconcile-invoice-line-items`, `backfill-permissions`, `clear-placeholder-settings` | URL name | `ALLOW_MANUAL_DB_MIGRATE=1` |

The flag is a statement of intent, not a bypass: **`ALLOW_MANUAL_DB_MIGRATE=1` on a non-manual
database is refused too**, so a stray exported dev `DATABASE_URL` can't turn "set up manual" into
"touch dev". Dev and CI runs without the flag behave exactly as before.

Not guarded (no writes from automation): `db:generate` (no DB connection), `db:studio` (a manual
tool), read-only audit scripts (`stage6b2-financial-audit`, `stage-b-duplicate-scan`,
`stage4-expiry-sweep`, `stage4-pf-consistency`, `stage4.2-cron-audit`). Staging scripts keep their
own stronger handshake.

### 8.2 Tests

`src/lib/db/manual-db-guard.test.ts` — 15 tests, fake URLs only
(`postgres://u:p@127.0.0.1:5432/ireland_careers_manual` etc.): name extraction; exact and `*_manual`
detection; COMMENT label; automated-run refusal with no override and no credential echo;
migrate/seed refusal without the flag, allowance with it, refusal of the flag on dev; port-3001
refusal; live-identity refusal by name and by label.

Behaviour checks run with fake env files (no real DB touched): every guarded script exits 2 with
the refusal; `DATABASE_URL=<fake manual> pnpm vitest run …` aborts in global setup;
`PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001 playwright test --list` aborts at config load.

### 8.3 Distinct server and session

New `package.json` scripts. Each reads **`.env.manual.local`** (git-ignored by the existing `.env*`
rule) through Node's `--env-file`; the owner creates that file by hand — it is not committed and
no template with values exists.

| Script | Does |
|---|---|
| `pnpm dev:manual` | runs `scripts/manual-env-preflight.ts`, then `next dev --turbopack -H 127.0.0.1 -p 3001` |
| `pnpm db:migrate:manual` | the migrator against the manual DB (still needs `ALLOW_MANUAL_DB_MIGRATE=1`) |
| `pnpm db:seed:manual` | the six idempotent reference seeds, in order (needs the flag) |
| `pnpm db:seed:admin:manual` | interactive first admin for the manual DB (needs the flag) |

The **preflight** refuses to start unless: `DATABASE_URL` names the manual DB **and** the live
`current_database()` agrees; `AUTH_URL` is exactly `http://127.0.0.1:3001`; `AUTH_SECRET` is 32+
chars **and differs** from the `AUTH_SECRET` in that checkout's `.env.local`, if one exists (compared
in-process, never printed); and `127.0.0.1:3001` is free (so Next never drifts to another port).

**Variable names `.env.manual.local` must define** (values chosen by the owner; copy from the dev
file only where noted):

- `DATABASE_URL` — `…@127.0.0.1:5432/ireland_careers_manual`
- `AUTH_URL` — `http://127.0.0.1:3001`
- `AUTH_SECRET` — a **new** random value, 32+ characters
- `AWS_REGION`, `S3_BUCKET_DOCUMENTS` (required by `src/lib/env.ts`); `S3_ENDPOINT`,
  `S3_FORCE_PATH_STYLE`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` as in dev (MinIO). Optionally a
  separate bucket `career-ireland-documents-manual`.
- `MAIL_PROVIDER=console`
- Optional: `EMAIL_CRED_ENC_KEY`, `LOG_LEVEL`.
- **Do not add** `E2E_ADMIN_PASSWORD`, `E2E_STAFF_PASSWORD`, `CRON_SECRET`, `RESEND_API_KEY`, Sentry
  keys.

`node --env-file` does **not** override variables already exported in the shell — that is why the
preflight and the migrate/seed guards re-check the database name. Use a fresh shell.

**Why a separate git worktree is still required (verified in Next 16.4.3 source, no second server
started):**
- `next dev` puts its output in `<distDir>/dev` (`next/dist/server/config.js`:
  `result.distDir = join(result.distDir, 'dev')`), and with `experimental.lockDistDir` (default
  `true`, `config-shared.js`) acquires `<distDir>/dev/lock` via
  `Lockfile.acquireWithRetriesOrExit` (`server/lib/router-utils/setup-dev-bundler.js`). A second
  `next dev` in this checkout exits with "Another next dev server is already running".
- A per-server `distDir` would need a `next.config.ts` change, and editing `next.config.ts`
  **restarts the running :3000 dev server** (`server/lib/start-server.js` watches `CONFIG_FILES`
  and `process.exit(RESTART_EXIT_CODE)`). So it was not done.
- Next always loads `.env.development.local`, `.env.local`, `.env.development`, `.env` from the
  project directory (`@next/env` `loadEnvConfig`, no opt-out). In the main checkout, any variable
  missing from `.env.manual.local` would silently come from the dev `.env.local`. A worktree with
  **no** `.env.local` reads only `.env.manual.local`.

Session separation: the manual server is opened at `127.0.0.1:3001` (the dev server and the
Playwright `storageState` files use `localhost`), and it has its own `AUTH_SECRET`, so a session
JWT from one server is never accepted by the other.

## 9. Awaiting owner approval — exact command list

Nothing below has been run. Step (b) is the **migration** that needs the owner's specific
approval. Run every command in a **fresh shell** (no exported `DATABASE_URL`).

**(0) Prerequisite — the guards must be in the worktree.** A worktree is checked out from a
commit, and the guards, the `*:manual` scripts and the preflight are currently **uncommitted**
(as is other in-progress P0 work). Commit them first (owner decision), then:

```bash
cd /Users/nikkibonagiri/Desktop/ireland-careers
git worktree add ../ireland-careers-manual main
cd ../ireland-careers-manual
pnpm install --frozen-lockfile
# Owner creates ../ireland-careers-manual/.env.manual.local by hand (names in §8.3).
# Do NOT create a .env.local in the worktree.
```

**(a) Create the database** (local superuser; does not touch `ireland_careers_dev`):

```bash
psql -h 127.0.0.1 -p 5432 -d postgres -tAc \
  "select datname from pg_database where datname = 'ireland_careers_manual'"   # must print nothing
createdb -h 127.0.0.1 -p 5432 ireland_careers_manual
psql -h 127.0.0.1 -p 5432 -d ireland_careers_manual -c \
  "COMMENT ON DATABASE ireland_careers_manual IS 'icg:manual-testing — never run automated tests here'"
```

**(b) Apply migrations to the manual DB only** ← *needs specific approval*

```bash
cd /Users/nikkibonagiri/Desktop/ireland-careers-manual
ALLOW_MANUAL_DB_MIGRATE=1 pnpm db:migrate:manual
```

Without the flag it refuses; with the flag and a non-manual URL it also refuses.

**(c) Reference data** (idempotent upserts; same flag):

```bash
ALLOW_MANUAL_DB_MIGRATE=1 pnpm db:seed:manual
# optional, read-only on dev — occupations have no seed script (check table names with \dt first):
pg_dump -h 127.0.0.1 -d ireland_careers_dev --data-only \
  -t occupation_categories -t occupations -t qualifications \
  | psql -h 127.0.0.1 -d ireland_careers_manual
```

**(d) First manual admin** (interactive; the first user becomes the owner):

```bash
ALLOW_MANUAL_DB_MIGRATE=1 pnpm db:seed:admin:manual
```

**(e) Start the manual server** (from the worktree; :3000 keeps running untouched):

```bash
pnpm dev:manual        # preflight, then http://127.0.0.1:3001
```

**(f) Verification checklist**

- [ ] Preflight prints `✓ dev:manual preflight: database "ireland_careers_manual" …`.
- [ ] `psql -h 127.0.0.1 -l` lists both `ireland_careers_dev` and `ireland_careers_manual`.
- [ ] `select count(*) from drizzle.__drizzle_migrations` is the same in both (62 migration files today).
- [ ] Log in on `http://127.0.0.1:3001` as the manual admin; the E2E admin **cannot** log in there.
- [ ] Logging in on :3001 does not log you out of `localhost:3000`.
- [ ] Create employer `MANUAL-CHECK` on :3001; it does not appear on :3000.
- [ ] R5 / `MT-AUDIT` counts in `ireland_careers_dev` are unchanged (count before step (a), after step (e)).
- [ ] Main checkout: `pnpm -s test` passes; `pw-locked.sh … --project=admin` passes against :3000.
- [ ] Negative: `DATABASE_URL=<manual URL> pnpm test` refuses in global setup (in the worktree,
      plain `pnpm test` just fails — it has no `.env.local`, so no DB is configured); `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001 pnpm test:e2e` refuses at config load.

**(g) Rollback**

1. Stop the manual server (Ctrl-C in the worktree). :3000 was never changed.
2. Only after the owner confirms the name:
   `dropdb -h 127.0.0.1 -p 5432 --if-exists ireland_careers_manual`. `ireland_careers_dev`, R5 and
   `MT-AUDIT` are untouched.
3. `git worktree remove ../ireland-careers-manual` (removes its `.env.manual.local` with it).
4. The guards can stay — with no manual DB they are inert. To remove them, revert the files in §10.

## 10. Files changed for §8

New: `src/lib/db/manual-db-guard.ts`, `src/lib/db/manual-db-guard.test.ts`, `vitest.global-setup.ts`,
`scripts/manual-env-preflight.ts`.
Edited (additions only): `vitest.setup.ts`, `vitest.config.ts`, `playwright.config.ts`,
`e2e/global-setup.ts`, `src/lib/db/migrate.ts`, `scripts/_assert-local-db.ts`, `package.json`, and the
guard call in `scripts/{seed-currencies,seed-service-categories,seed-services-2026,seed-document-types,seed-accounting,seed-skills,seed-admin,reconcile-invoice-line-items,backfill-permissions,clear-placeholder-settings,repro-task-generator-race,stage2-correctness-check,stage3-service-walkthrough,stage4-safety-checks,stage4.1-refund-walkthrough,stage4.2-refund-invariants}.ts`.
