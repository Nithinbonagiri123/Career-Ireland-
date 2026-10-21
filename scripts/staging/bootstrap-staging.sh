#!/usr/bin/env bash
#
# Staging bootstrap (release-prep) — migrations + synthetic seed data for
# the Stage B staging environment, with layered protection against ever
# touching production or the local dev database:
#
#   1. Takes ONLY `STAGING_DATABASE_URL` — a deliberately distinct name,
#      so pasting a production `DATABASE_URL`/`PROD_DATABASE_URL` into
#      the usual variable does nothing here.
#   2. guard-staging-db.ts probes the target first and ABORTS unless the
#      DB is empty/fresh or already carries the `__staging_marker` table;
#      any database with invoices, receipts, or >25 persons and no
#      marker is refused outright.
#   3. Only after the guard passes is DATABASE_URL exported (from the
#      staging URL) for the migration script and seeds — shell env beats
#      .env.local in every script (dotenv never overrides existing vars).
#   4. On success the `__staging_marker` table is written so re-runs are
#      recognised and the tripwire stays armed for everything else.
#
# Credentials are NEVER passed through chat or the command line history:
# the owner writes them into `.env.staging.local` at the repo root (the
# file is covered by the `.env*` gitignore rule and is sourced below).
#
# Required in .env.staging.local (or the shell env):
#   STAGING_DATABASE_URL       the staging Postgres URL (never production's)
#   STAGING_DB_EXPECTED_HOST   the APPROVED staging DB hostname — the guard
#                              refuses any connection whose host differs
#   STAGING_DB_EXPECTED_NAME   the APPROVED database name — checked against
#                              the URL and current_database() on the wire
#   STAGING_DB_EXPECTED_ENDPOINT_ID  optional (Neon): the ep-… endpoint id
#                              pinning the exact project/branch
#   STAGING_ADMIN_EMAIL / STAGING_ADMIN_PASSWORD   (owner/admin login)
#   STAGING_STAFF_EMAIL / STAGING_STAFF_PASSWORD   (ungranted STAFF login)
#
# Usage:
#   ./scripts/staging/bootstrap-staging.sh

set -euo pipefail
cd "$(dirname "$0")/../.."

# Owner-managed credentials file (gitignored via .env*). Shell env still
# wins for any variable already exported.
if [[ -f .env.staging.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.staging.local
  set +a
fi

: "${STAGING_DATABASE_URL:?STAGING_DATABASE_URL must be set (the dedicated staging DB)}"
: "${STAGING_DB_EXPECTED_HOST:?STAGING_DB_EXPECTED_HOST must be set (the approved staging DB hostname)}"
: "${STAGING_DB_EXPECTED_NAME:?STAGING_DB_EXPECTED_NAME must be set (the approved staging database name)}"

echo "▸ Guard: probing the staging target…"
pnpm exec tsx scripts/staging/guard-staging-db.ts

export DATABASE_URL="$STAGING_DATABASE_URL"

echo "▸ Applying migrations (0000 → latest) to staging…"
./scripts/ci/apply-migrations.sh

echo "▸ Seeding lookups (currencies, document types, categories, services, skills)…"
pnpm exec tsx scripts/seed-currencies.ts
pnpm exec tsx scripts/seed-document-types.ts
pnpm exec tsx scripts/seed-service-categories.ts
pnpm exec tsx scripts/seed-services-2026.ts
pnpm exec tsx scripts/seed-skills.ts

echo "▸ Creating staging test accounts…"
pnpm exec tsx scripts/staging/seed-staging-users.ts

echo "▸ Seeding realistic synthetic data (all @example.test — zero production PII)…"
pnpm exec tsx scripts/seed-realistic.ts

echo "▸ Writing __staging_marker (identity: $STAGING_DB_EXPECTED_HOST)…"
psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -q \
  -v host="$STAGING_DB_EXPECTED_HOST" <<'SQL'
CREATE TABLE IF NOT EXISTS __staging_marker (
  note text NOT NULL,
  expected_host text NOT NULL,
  expected_db text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO __staging_marker (note, expected_host, expected_db)
VALUES ('stage-b staging bootstrap', :'host', current_database());
SQL

echo "✓ Staging database bootstrapped. Logins: $STAGING_ADMIN_EMAIL (admin/owner), $STAGING_STAFF_EMAIL (ungranted STAFF)."
