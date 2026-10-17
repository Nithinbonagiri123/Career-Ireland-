CREATE TABLE "pro_forma_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" varchar(24) NOT NULL,
	"proposal_group_id" uuid,
	"source_lead_id" uuid NOT NULL,
	"payer_person_id" uuid NOT NULL,
	"currency_code" text NOT NULL,
	"subtotal" numeric(14, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"issued_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"accepted_by_user_id" uuid,
	"rejected_at" timestamp with time zone,
	"rejected_by_user_id" uuid,
	"rejected_reason" text,
	"cancelled_at" timestamp with time zone,
	"cancelled_by_user_id" uuid,
	"notes" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pro_forma_invoices_number_unique" UNIQUE("number"),
	CONSTRAINT "pro_forma_invoices_subtotal_nonneg" CHECK ("pro_forma_invoices"."subtotal" >= 0),
	CONSTRAINT "pro_forma_invoices_revision_pos" CHECK ("pro_forma_invoices"."revision" >= 1)
);
--> statement-breakpoint
CREATE TABLE "pro_forma_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pro_forma_invoice_id" uuid NOT NULL,
	"service_catalog_item_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(10, 3) NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"line_subtotal" numeric(14, 2) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pro_forma_line_items_quantity_pos" CHECK ("pro_forma_line_items"."quantity" > 0),
	CONSTRAINT "pro_forma_line_items_unit_price_nonneg" CHECK ("pro_forma_line_items"."unit_price" >= 0),
	CONSTRAINT "pro_forma_line_items_line_subtotal_nonneg" CHECK ("pro_forma_line_items"."line_subtotal" >= 0)
);
--> statement-breakpoint
CREATE TABLE "pro_forma_official_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pro_forma_invoice_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"coverage" text,
	"issued_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pro_forma_official_invoices_invoice_unique" UNIQUE("invoice_id"),
	CONSTRAINT "pro_forma_official_invoices_pair_unique" UNIQUE("pro_forma_invoice_id","invoice_id")
);
--> statement-breakpoint
CREATE TABLE "proposal_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"notes" text,
	"decided_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "vat_registration_effective_date" date;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "pro_forma_invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "conversion_reason" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "expired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "expired_by_reason" text;--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "middle_name" varchar(100);--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "address_line_1" varchar(255);--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "address_line_2" varchar(255);--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "primary_occupation_id" uuid;--> statement-breakpoint
ALTER TABLE "pro_forma_invoices" ADD CONSTRAINT "pro_forma_invoices_proposal_group_id_proposal_groups_id_fk" FOREIGN KEY ("proposal_group_id") REFERENCES "public"."proposal_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_forma_invoices" ADD CONSTRAINT "pro_forma_invoices_source_lead_id_leads_id_fk" FOREIGN KEY ("source_lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_forma_invoices" ADD CONSTRAINT "pro_forma_invoices_payer_person_id_persons_id_fk" FOREIGN KEY ("payer_person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_forma_invoices" ADD CONSTRAINT "pro_forma_invoices_currency_code_currencies_code_fk" FOREIGN KEY ("currency_code") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_forma_invoices" ADD CONSTRAINT "pro_forma_invoices_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_forma_invoices" ADD CONSTRAINT "pro_forma_invoices_rejected_by_user_id_users_id_fk" FOREIGN KEY ("rejected_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_forma_invoices" ADD CONSTRAINT "pro_forma_invoices_cancelled_by_user_id_users_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_forma_invoices" ADD CONSTRAINT "pro_forma_invoices_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_forma_line_items" ADD CONSTRAINT "pro_forma_line_items_pro_forma_invoice_id_pro_forma_invoices_id_fk" FOREIGN KEY ("pro_forma_invoice_id") REFERENCES "public"."pro_forma_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_forma_line_items" ADD CONSTRAINT "pro_forma_line_items_service_catalog_item_id_service_catalog_items_id_fk" FOREIGN KEY ("service_catalog_item_id") REFERENCES "public"."service_catalog_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_forma_official_invoices" ADD CONSTRAINT "pro_forma_official_invoices_pro_forma_invoice_id_pro_forma_invoices_id_fk" FOREIGN KEY ("pro_forma_invoice_id") REFERENCES "public"."pro_forma_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_forma_official_invoices" ADD CONSTRAINT "pro_forma_official_invoices_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_forma_official_invoices" ADD CONSTRAINT "pro_forma_official_invoices_issued_by_user_id_users_id_fk" FOREIGN KEY ("issued_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_groups" ADD CONSTRAINT "proposal_groups_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_groups" ADD CONSTRAINT "proposal_groups_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pro_forma_invoices_source_lead_idx" ON "pro_forma_invoices" USING btree ("source_lead_id");--> statement-breakpoint
CREATE INDEX "pro_forma_invoices_group_idx" ON "pro_forma_invoices" USING btree ("proposal_group_id");--> statement-breakpoint
CREATE INDEX "pro_forma_invoices_status_idx" ON "pro_forma_invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pro_forma_invoices_payer_person_idx" ON "pro_forma_invoices" USING btree ("payer_person_id");--> statement-breakpoint
CREATE INDEX "pro_forma_line_items_proforma_idx" ON "pro_forma_line_items" USING btree ("pro_forma_invoice_id");--> statement-breakpoint
CREATE INDEX "pro_forma_line_items_service_idx" ON "pro_forma_line_items" USING btree ("service_catalog_item_id");--> statement-breakpoint
CREATE INDEX "pro_forma_official_invoices_proforma_idx" ON "pro_forma_official_invoices" USING btree ("pro_forma_invoice_id");--> statement-breakpoint
CREATE INDEX "proposal_groups_lead_idx" ON "proposal_groups" USING btree ("lead_id");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_pro_forma_invoice_id_pro_forma_invoices_id_fk" FOREIGN KEY ("pro_forma_invoice_id") REFERENCES "public"."pro_forma_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_pro_forma_idx" ON "payments" USING btree ("pro_forma_invoice_id");