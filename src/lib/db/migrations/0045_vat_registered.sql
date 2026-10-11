-- Phase 3 blueprint §8.2 — explicit "we are VAT-registered" flag so
-- VAT-off is no longer implicit via a 0.00 rate. Additive, defaults
-- to false so existing installs keep behaving like VAT-off.

ALTER TABLE "app_settings"
  ADD COLUMN "vat_registered" boolean NOT NULL DEFAULT false;
