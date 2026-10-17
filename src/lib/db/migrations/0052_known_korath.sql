CREATE TABLE "pro_forma_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pro_forma_invoice_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"reason" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pro_forma_revisions_unique" UNIQUE("pro_forma_invoice_id","revision"),
	CONSTRAINT "pro_forma_revisions_revision_pos" CHECK ("pro_forma_revisions"."revision" >= 1)
);
--> statement-breakpoint
ALTER TABLE "pro_forma_official_invoices" DROP CONSTRAINT "pro_forma_official_invoices_pair_unique";--> statement-breakpoint
ALTER TABLE "pro_forma_invoices" ADD COLUMN "payment_terms" text;--> statement-breakpoint
ALTER TABLE "pro_forma_official_invoices" ADD COLUMN "purpose" text DEFAULT 'FULL_PAYMENT' NOT NULL;--> statement-breakpoint
ALTER TABLE "pro_forma_official_invoices" ADD COLUMN "issuance_key" text DEFAULT 'full' NOT NULL;--> statement-breakpoint
ALTER TABLE "pro_forma_revisions" ADD CONSTRAINT "pro_forma_revisions_pro_forma_invoice_id_pro_forma_invoices_id_fk" FOREIGN KEY ("pro_forma_invoice_id") REFERENCES "public"."pro_forma_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_forma_revisions" ADD CONSTRAINT "pro_forma_revisions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pro_forma_revisions_proforma_idx" ON "pro_forma_revisions" USING btree ("pro_forma_invoice_id");--> statement-breakpoint
ALTER TABLE "persons" ADD CONSTRAINT "persons_primary_occupation_id_occupations_id_fk" FOREIGN KEY ("primary_occupation_id") REFERENCES "public"."occupations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pro_forma_invoices_one_accepted_per_group" ON "pro_forma_invoices" USING btree ("proposal_group_id") WHERE "pro_forma_invoices"."status" = 'ACCEPTED';--> statement-breakpoint
ALTER TABLE "pro_forma_official_invoices" ADD CONSTRAINT "pro_forma_official_invoices_purpose_unique" UNIQUE("pro_forma_invoice_id","purpose","issuance_key");--> statement-breakpoint
ALTER TABLE "pro_forma_invoices" ADD CONSTRAINT "pro_forma_invoices_status_check" CHECK ("pro_forma_invoices"."status" IN ('DRAFT','ISSUED','ACCEPTED','REJECTED','CANCELLED','CONVERTED','SUPERSEDED'));--> statement-breakpoint
ALTER TABLE "pro_forma_official_invoices" ADD CONSTRAINT "pro_forma_official_invoices_purpose_check" CHECK ("pro_forma_official_invoices"."purpose" IN ('FULL_PAYMENT','DEPOSIT','BALANCE','MILESTONE','AMENDMENT'));