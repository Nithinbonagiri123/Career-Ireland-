ALTER TABLE "app_settings" ADD COLUMN "complimentary_invoice_note" text DEFAULT 'Provided as a complimentary service — no payment is due.' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "settlement_kind" text DEFAULT 'STANDARD' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "complimentary_reason" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "complimentary_granted_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_complimentary_granted_by_user_id_users_id_fk" FOREIGN KEY ("complimentary_granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_complimentary_reason" CHECK (("invoices"."settlement_kind" = 'COMPLIMENTARY') = ("invoices"."complimentary_reason" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_complimentary_zero_total" CHECK ("invoices"."settlement_kind" != 'COMPLIMENTARY' OR "invoices"."total_amount" = 0);