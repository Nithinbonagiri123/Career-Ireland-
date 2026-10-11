-- Phase 3 blueprint §8.3 — snapshot the VAT treatment onto the invoice
-- at issue time so a later edit to the employer's vatTreatment field
-- never retroactively changes a printed VAT document. Defaults to
-- STANDARD so historical rows match today's rendering.

ALTER TABLE "invoices"
  ADD COLUMN "vat_treatment" text NOT NULL DEFAULT 'STANDARD';
