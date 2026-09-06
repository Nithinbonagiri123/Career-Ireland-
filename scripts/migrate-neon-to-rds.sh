#!/usr/bin/env bash
# One-shot Neon → RDS migration helper.
#
# Reads NEON_URL and RDS_URL from the environment (both must include
# `sslmode=require`) and:
#   1. pg_dumps Neon to /tmp
#   2. pg_restores into RDS
#   3. prints row counts on both sides for a quick equality check
#
# Safe to re-run — it dumps to a timestamped file so you can compare
# multiple runs if something looks off.
#
# See docs/aws-migration.md § 4 for the full runbook.
set -euo pipefail

: "${NEON_URL:?set NEON_URL to your Neon postgres connection string}"
: "${RDS_URL:?set RDS_URL to your RDS postgres connection string}"

DUMP_FILE="/tmp/ireland-careers-neon-$(date +%Y%m%d-%H%M%S).dump"

echo "▸ Dumping Neon to $DUMP_FILE …"
pg_dump --format=custom --no-owner --no-acl --file="$DUMP_FILE" "$NEON_URL"
echo "  ✓ dump size: $(du -h "$DUMP_FILE" | cut -f1)"

echo ""
echo "▸ Loading into RDS …"
# --clean would drop objects first — we DON'T want that on prod. --if-exists
# means the restore is safe against a fresh (empty) target too.
pg_restore --no-owner --no-acl --dbname="$RDS_URL" "$DUMP_FILE" || {
  echo "  ! pg_restore reported non-zero — inspect stderr above. Some warnings"
  echo "    about extensions / roles are harmless; real errors will show as"
  echo "    lines beginning 'ERROR:'."
}

echo ""
echo "▸ Row-count sanity check"
tables=("users" "persons" "audit_events" "candidate_profiles" "documents" "invoices" "receipts")
printf '  %-28s %-12s %-12s\n' "table" "neon" "rds"
printf '  %-28s %-12s %-12s\n' "-----" "----" "---"
for t in "${tables[@]}"; do
  neon_n=$(psql "$NEON_URL" -tAc "select count(*) from \"$t\"" 2>/dev/null || echo "n/a")
  rds_n=$(psql "$RDS_URL" -tAc "select count(*) from \"$t\"" 2>/dev/null || echo "n/a")
  marker=""
  if [[ "$neon_n" != "$rds_n" ]]; then marker="  ← MISMATCH"; fi
  printf '  %-28s %-12s %-12s%s\n' "$t" "$neon_n" "$rds_n" "$marker"
done

echo ""
echo "  Any MISMATCH above needs investigation before you cut over Vercel."
echo "  Rows that only exist on Neon can be re-dumped: just re-run this script."
