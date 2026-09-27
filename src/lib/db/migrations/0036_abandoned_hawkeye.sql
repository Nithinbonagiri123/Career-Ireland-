ALTER TABLE "leads" ALTER COLUMN "person_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "immigration_case_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "job_requisition_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "source_lead_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "target_business" text DEFAULT 'CANDIDATE_SERVICES' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "employer_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "accepted_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "accepted_entity_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_employer_id_employers_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."employers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoices_immigration_case_idx" ON "invoices" USING btree ("immigration_case_id");--> statement-breakpoint
CREATE INDEX "invoices_job_requisition_idx" ON "invoices" USING btree ("job_requisition_id");--> statement-breakpoint
CREATE INDEX "invoices_source_lead_idx" ON "invoices" USING btree ("source_lead_id");--> statement-breakpoint
CREATE INDEX "leads_target_business_idx" ON "leads" USING btree ("target_business");--> statement-breakpoint
CREATE INDEX "leads_employer_idx" ON "leads" USING btree ("employer_id");--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_payer_matches_target" CHECK (
        (
          "leads"."target_business" = 'RECRUITMENT'
          AND "leads"."employer_id" IS NOT NULL
          AND "leads"."person_id" IS NULL
        )
        OR (
          "leads"."target_business" IN ('CANDIDATE_SERVICES', 'IMMIGRATION')
          AND "leads"."person_id" IS NOT NULL
          AND "leads"."employer_id" IS NULL
        )
      );