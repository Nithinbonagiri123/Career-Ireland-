-- Stage 6G Screen 02 — safe additive migration.
--
-- Adds six nullable fields to `persons` so the New Lead form can
-- capture the full field set from the approved mockup:
--
--   postcode              → operator-entered residential postcode
--   years_of_experience   → freeform ("5 years", "<1 year", "20+")
--   employment_status     → EMPLOYED | UNEMPLOYED | SELF_EMPLOYED | STUDENT | RETIRED | OTHER
--   professional_summary  → short freeform blurb about the candidate
--   work_eligibility      → IRISH_CITIZEN | EU_EEA_SWISS_CITIZEN | UK_CITIZEN | STAMP_4_HOLDER |
--                           VISA_REQUIRED | OTHER | NOT_SURE
--   currently_in_ireland  → boolean; nullable so "unknown" is distinct from Yes/No
--
-- Non-destructive:
--   - no column drops / renames
--   - no NOT NULL added
--   - no CHECK constraints (TS enum enforcement only, consistent with
--     the existing `source` and `irish_immigration_status` columns)
--   - no row rewrites
--
-- Reversible: `ALTER TABLE persons DROP COLUMN <col>` per column.

ALTER TABLE "persons"
  ADD COLUMN IF NOT EXISTS "postcode" varchar(20),
  ADD COLUMN IF NOT EXISTS "years_of_experience" varchar(60),
  ADD COLUMN IF NOT EXISTS "employment_status" text,
  ADD COLUMN IF NOT EXISTS "professional_summary" text,
  ADD COLUMN IF NOT EXISTS "work_eligibility" text,
  ADD COLUMN IF NOT EXISTS "currently_in_ireland" boolean;
