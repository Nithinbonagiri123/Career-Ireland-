-- Stage 6E+1 — safe additive migration.
--
-- Adds `persons.irish_immigration_status` as a nullable text column
-- (no default, no enum type) so existing rows are not touched. A
-- one-off UPDATE lifts the Stage 6E `[Irish immigration status: X]`
-- notes marker into the new column WHERE the mapping is unambiguous.
--
-- Non-destructive:
--   - no column drops
--   - no column renames
--   - no NOT NULL added
--   - no CHECK constraint (TS enum enforcement only)
--   - no row deletes
--   - keeps the original notes verbatim (the marker stays in notes so
--     the audit trail of what the operator originally typed survives)
--
-- Reversible: `ALTER TABLE persons DROP COLUMN irish_immigration_status`.

ALTER TABLE "persons"
  ADD COLUMN IF NOT EXISTS "irish_immigration_status" text;

-- Backfill from the Stage 6E `[Irish immigration status: <label>]`
-- marker that lived in `notes`. Only applies where the mapping is
-- unambiguous. Marker variants that don't match any known label leave
-- the column NULL so the next operator edit can set it explicitly.
UPDATE "persons"
SET "irish_immigration_status" = CASE
  WHEN "notes" LIKE '%[Irish immigration status: Not currently in Ireland / no Irish immigration permission]%'
    THEN 'NONE'
  WHEN "notes" LIKE '%[Irish immigration status: Stamp 1]%' THEN 'STAMP_1'
  WHEN "notes" LIKE '%[Irish immigration status: Stamp 1G]%' THEN 'STAMP_1G'
  WHEN "notes" LIKE '%[Irish immigration status: Stamp 2]%' THEN 'STAMP_2'
  WHEN "notes" LIKE '%[Irish immigration status: Stamp 3]%' THEN 'STAMP_3'
  WHEN "notes" LIKE '%[Irish immigration status: Stamp 4]%' THEN 'STAMP_4'
  WHEN "notes" LIKE '%[Irish immigration status: Other Irish permission]%' THEN 'OTHER'
  WHEN "notes" LIKE '%[Irish immigration status: Permission pending]%' THEN 'PENDING'
  WHEN "notes" LIKE '%[Irish immigration status: Not provided]%' THEN 'NOT_PROVIDED'
  ELSE NULL
END
WHERE "irish_immigration_status" IS NULL
  AND "notes" LIKE '%[Irish immigration status:%';
