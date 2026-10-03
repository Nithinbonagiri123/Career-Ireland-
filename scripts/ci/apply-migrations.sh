#!/usr/bin/env bash
#
# Apply pending Drizzle migration files to the production DB via psql.
#
# Replaces `drizzle-kit push` in CI. push's arrow-key prompts are not
# reliably scriptable (expect wrappers timed out), and `--force` is
# destructive. This script sidesteps both: it treats migration .sql files
# as the single source of truth and applies them in order, tracking which
# have landed in a small `__ic_migrations(filename)` table.
#
# First-run on an existing prod DB: the tracking table must be pre-seeded
# with the filenames of migrations that are already applied — otherwise
# this script would re-run 0000-0038 against tables that already exist
# and fail. Seed command (run once against prod before the first CI
# execution of this script):
#
#   psql "$DATABASE_URL" <<'SQL'
#   CREATE TABLE IF NOT EXISTS __ic_migrations (
#     filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()
#   );
#   SQL
#   for f in src/lib/db/migrations/*.sql; do
#     psql "$DATABASE_URL" -c \
#       "INSERT INTO __ic_migrations (filename) VALUES ('$(basename "$f")') \
#        ON CONFLICT DO NOTHING"
#   done
#
# For a brand-new DB, skip the seed — empty __ic_migrations means every
# migration will be applied in order from 0000.
#
# Exit code 1 if any migration SQL fails — the surrounding CI job can
# then trigger a Vercel rollback via its own `if: failure()` guard.

set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL must be set}"

MIGRATIONS_DIR="${MIGRATIONS_DIR:-src/lib/db/migrations}"

# Idempotent — the tracking table itself must exist before we can check
# anything. CREATE TABLE IF NOT EXISTS is safe on a fresh DB and a no-op
# everywhere else.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
CREATE TABLE IF NOT EXISTS __ic_migrations (
  filename   text        PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
SQL

shopt -s nullglob
applied=0
skipped=0
for f in "$MIGRATIONS_DIR"/*.sql; do
  name=$(basename "$f")
  # -tA = tuples-only + unaligned; empty string when no row matches.
  already=$(psql "$DATABASE_URL" -tA -c \
    "SELECT 1 FROM __ic_migrations WHERE filename = '$name'")
  if [[ "$already" == "1" ]]; then
    skipped=$((skipped + 1))
    continue
  fi
  echo "apply: $name"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c \
    "INSERT INTO __ic_migrations (filename) VALUES ('$name')"
  applied=$((applied + 1))
done

echo "✓ migrations: $applied applied, $skipped already-applied"
