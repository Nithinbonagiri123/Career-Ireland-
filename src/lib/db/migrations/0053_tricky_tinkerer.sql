CREATE TABLE "invoice_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"service_catalog_item_id" uuid,
	"description" text NOT NULL,
	"quantity" numeric(10, 3) NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"line_subtotal" numeric(14, 2) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_line_items_quantity_pos" CHECK ("invoice_line_items"."quantity" > 0),
	CONSTRAINT "invoice_line_items_unit_price_nonneg" CHECK ("invoice_line_items"."unit_price" >= 0),
	CONSTRAINT "invoice_line_items_subtotal_nonneg" CHECK ("invoice_line_items"."line_subtotal" >= 0)
);
--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_subtotal_matches_qty_times_unit_price";--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_line_items_invoice_idx" ON "invoice_line_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoice_line_items_service_idx" ON "invoice_line_items" USING btree ("service_catalog_item_id");--> statement-breakpoint
-- Stage 3 additive backfill: materialise one line item per existing
-- invoice so the Stage 4 multi-line printable can be shipped without a
-- data-migration gap. Uses the legacy header columns as the source of
-- truth, joins to service_engagements to derive the catalog item (left
-- outer so invoices whose engagement has been archived still backfill).
INSERT INTO "invoice_line_items" (
  invoice_id, service_catalog_item_id, description, quantity, unit_price, line_subtotal, sort_order
)
SELECT
  i.id,
  se.service_catalog_item_id,
  i.line_description,
  i.qty::numeric(10,3),
  i.unit_price,
  i.subtotal,
  0
FROM "invoices" i
LEFT JOIN "service_engagements" se ON se.id = i.service_engagement_id
WHERE NOT EXISTS (
  SELECT 1 FROM "invoice_line_items" li WHERE li.invoice_id = i.id
);