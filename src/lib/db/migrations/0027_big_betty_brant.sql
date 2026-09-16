ALTER TABLE "invoices" ALTER COLUMN "payer_person_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "receipts" ALTER COLUMN "payer_person_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "payer_employer_id" uuid;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "payer_employer_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_payer_employer_id_employers_id_fk" FOREIGN KEY ("payer_employer_id") REFERENCES "public"."employers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_payer_employer_id_employers_id_fk" FOREIGN KEY ("payer_employer_id") REFERENCES "public"."employers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoices_payer_employer_idx" ON "invoices" USING btree ("payer_employer_id");--> statement-breakpoint
CREATE INDEX "receipts_payer_employer_idx" ON "receipts" USING btree ("payer_employer_id");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_payer_xor" CHECK (("invoices"."payer_person_id" IS NOT NULL) <> ("invoices"."payer_employer_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_payer_xor" CHECK (("receipts"."payer_person_id" IS NOT NULL) <> ("receipts"."payer_employer_id" IS NOT NULL));