CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_engagement_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency_code" char(3) NOT NULL,
	"method" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"proof_reference" text,
	"proof_document_instance_id" uuid,
	"received_at" timestamp with time zone,
	"verified_by_user_id" uuid,
	"verified_at" timestamp with time zone,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_engagements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_catalog_item_id" uuid NOT NULL,
	"service_package_id" uuid,
	"payer_person_id" uuid,
	"payer_employer_id" uuid,
	"beneficiary_person_id" uuid,
	"related_placement_id" uuid,
	"related_job_requisition_id" uuid,
	"related_immigration_case_id" uuid,
	"agreed_amount" numeric(14, 2) NOT NULL,
	"currency_code" char(3) NOT NULL,
	"status" text DEFAULT 'REQUESTED' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_engagements_payer_xor" CHECK (("service_engagements"."payer_person_id" IS NOT NULL) <> ("service_engagements"."payer_employer_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "persons" ALTER COLUMN "normalized_email" DROP EXPRESSION;--> statement-breakpoint
ALTER TABLE "persons" ALTER COLUMN "normalized_phone" DROP EXPRESSION;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_service_engagement_id_service_engagements_id_fk" FOREIGN KEY ("service_engagement_id") REFERENCES "public"."service_engagements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_currency_code_currencies_code_fk" FOREIGN KEY ("currency_code") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_verified_by_user_id_users_id_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_engagements" ADD CONSTRAINT "service_engagements_service_catalog_item_id_service_catalog_items_id_fk" FOREIGN KEY ("service_catalog_item_id") REFERENCES "public"."service_catalog_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_engagements" ADD CONSTRAINT "service_engagements_service_package_id_service_packages_id_fk" FOREIGN KEY ("service_package_id") REFERENCES "public"."service_packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_engagements" ADD CONSTRAINT "service_engagements_payer_person_id_persons_id_fk" FOREIGN KEY ("payer_person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_engagements" ADD CONSTRAINT "service_engagements_beneficiary_person_id_persons_id_fk" FOREIGN KEY ("beneficiary_person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_engagements" ADD CONSTRAINT "service_engagements_currency_code_currencies_code_fk" FOREIGN KEY ("currency_code") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_engagement_idx" ON "payments" USING btree ("service_engagement_id");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "service_engagements_payer_person_idx" ON "service_engagements" USING btree ("payer_person_id");--> statement-breakpoint
CREATE INDEX "service_engagements_payer_employer_idx" ON "service_engagements" USING btree ("payer_employer_id");--> statement-breakpoint
CREATE INDEX "service_engagements_beneficiary_idx" ON "service_engagements" USING btree ("beneficiary_person_id");--> statement-breakpoint
CREATE INDEX "service_engagements_status_idx" ON "service_engagements" USING btree ("status");