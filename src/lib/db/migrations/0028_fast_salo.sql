ALTER TABLE "app_settings" ADD COLUMN "vat_rate_percent" numeric(5, 2) DEFAULT '23.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "qty" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
-- Add unit_price nullable first so the ALTER succeeds against the
-- existing rows (INV-2026-000024, INV-2026-000025, SEED-INV-*), then
-- backfill from the current subtotal (qty was 1 by default so
-- subtotal = qty × unit_price = subtotal holds), THEN flip to NOT
-- NULL and add the CHECK constraint. Doing this in one shot would
-- refuse the ALTER because unit_price has no server-side default.
ALTER TABLE "invoices" ADD COLUMN "unit_price" numeric(14, 2);--> statement-breakpoint
UPDATE "invoices" SET "unit_price" = "subtotal" WHERE "unit_price" IS NULL;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "unit_price" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_qty_positive" CHECK ("invoices"."qty" > 0);--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subtotal_matches_qty_times_unit_price" CHECK ("invoices"."subtotal" = "invoices"."qty" * "invoices"."unit_price");
