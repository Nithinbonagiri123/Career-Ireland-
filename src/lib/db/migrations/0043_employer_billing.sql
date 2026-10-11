-- Phase 1 blueprint §4.1 — proper employer billing info + onboarding.

ALTER TABLE "employers"
  ADD COLUMN "address_line1" varchar(200),
  ADD COLUMN "address_line2" varchar(200),
  ADD COLUMN "postcode" varchar(40),
  ADD COLUMN "billing_email" varchar(200),
  ADD COLUMN "vat_id" varchar(40),
  ADD COLUMN "vat_treatment" text NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN "payment_terms_days" integer,
  ADD COLUMN "onboarding_completed_at" timestamp with time zone;

ALTER TABLE "employers"
  ADD CONSTRAINT "employers_vat_treatment_check"
  CHECK ("vat_treatment" IN ('STANDARD', 'REVERSE_CHARGE', 'EXEMPT', 'OUTSIDE_SCOPE'));
