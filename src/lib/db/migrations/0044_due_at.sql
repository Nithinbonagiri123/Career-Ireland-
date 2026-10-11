-- Phase 3 blueprint §7.2 — per-invoice dueAt + app-level default
-- payment terms. Both nullable / defaulted so no backfill needed.

ALTER TABLE "invoices" ADD COLUMN "due_at" timestamp with time zone;

ALTER TABLE "app_settings"
  ADD COLUMN "default_payment_terms_days" integer NOT NULL DEFAULT 14;
