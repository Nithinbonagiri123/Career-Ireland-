-- Stage 6F Phase 3 — education_entries table.
--
-- Separate surface from candidate_qualifications so credentials (which
-- back matching) stay distinct from schooling records (which are
-- free-text informational entries only). No column drops / renames; a
-- straight CREATE TABLE on a brand-new name.
--
-- Reversible: `DROP TABLE education_entries` loses only Stage 6F+
-- data, nothing older.

CREATE TABLE IF NOT EXISTS "education_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "person_id" uuid NOT NULL REFERENCES "persons"("id"),
  "institution" varchar(200) NOT NULL,
  "degree" varchar(200),
  "field_of_study" varchar(200),
  "start_date" date,
  "end_date" date,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  CONSTRAINT "education_entries_dates_ordered"
    CHECK ("end_date" IS NULL OR "start_date" IS NULL OR "end_date" >= "start_date")
);

CREATE INDEX IF NOT EXISTS "education_entries_person_idx"
  ON "education_entries" ("person_id");
