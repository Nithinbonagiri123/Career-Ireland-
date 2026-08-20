CREATE TABLE "communication_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"direction" text DEFAULT 'OUTBOUND' NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"staff_user_id" uuid NOT NULL,
	"subject" varchar(255),
	"body" text,
	"person_id" uuid,
	"employer_id" uuid,
	"employer_contact_id" uuid,
	"job_requisition_id" uuid,
	"service_engagement_id" uuid,
	"immigration_case_id" uuid,
	"follow_up_required" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "communication_logs_has_subject" CHECK ("communication_logs"."person_id" IS NOT NULL OR "communication_logs"."employer_id" IS NOT NULL OR "communication_logs"."employer_contact_id" IS NOT NULL OR "communication_logs"."job_requisition_id" IS NOT NULL OR "communication_logs"."service_engagement_id" IS NOT NULL OR "communication_logs"."immigration_case_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"due_at" timestamp with time zone,
	"assigned_user_id" uuid NOT NULL,
	"priority" text DEFAULT 'NORMAL' NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"completed_at" timestamp with time zone,
	"person_id" uuid,
	"employer_id" uuid,
	"job_requisition_id" uuid,
	"service_engagement_id" uuid,
	"immigration_case_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "advertisements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"country" varchar(80) NOT NULL,
	"platform" varchar(120),
	"target_applicants" integer DEFAULT 0 NOT NULL,
	"start_date" date NOT NULL,
	"expiry_date" date NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recruitment_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_requisition_id" uuid,
	"name" varchar(200) NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recruitment_prospects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"advertisement_id" uuid NOT NULL,
	"status" text DEFAULT 'NEW' NOT NULL,
	"screened_by_user_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recruitment_prospects_person_ad_unique" UNIQUE("person_id","advertisement_id")
);
--> statement-breakpoint
CREATE TABLE "immigration_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_type" text NOT NULL,
	"beneficiary_person_id" uuid NOT NULL,
	"sponsor_employer_id" uuid,
	"related_placement_id" uuid,
	"related_job_requisition_id" uuid,
	"service_engagement_id" uuid,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"authority_reference" varchar(120),
	"submitted_at" date,
	"decision_at" date,
	"expires_on" date,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "communication_logs" ADD CONSTRAINT "communication_logs_staff_user_id_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_logs" ADD CONSTRAINT "communication_logs_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_logs" ADD CONSTRAINT "communication_logs_employer_id_employers_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."employers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_logs" ADD CONSTRAINT "communication_logs_employer_contact_id_employer_contacts_id_fk" FOREIGN KEY ("employer_contact_id") REFERENCES "public"."employer_contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_logs" ADD CONSTRAINT "communication_logs_job_requisition_id_job_requisitions_id_fk" FOREIGN KEY ("job_requisition_id") REFERENCES "public"."job_requisitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_logs" ADD CONSTRAINT "communication_logs_service_engagement_id_service_engagements_id_fk" FOREIGN KEY ("service_engagement_id") REFERENCES "public"."service_engagements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_employer_id_employers_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."employers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_job_requisition_id_job_requisitions_id_fk" FOREIGN KEY ("job_requisition_id") REFERENCES "public"."job_requisitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_service_engagement_id_service_engagements_id_fk" FOREIGN KEY ("service_engagement_id") REFERENCES "public"."service_engagements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advertisements" ADD CONSTRAINT "advertisements_campaign_id_recruitment_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."recruitment_campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_campaigns" ADD CONSTRAINT "recruitment_campaigns_job_requisition_id_job_requisitions_id_fk" FOREIGN KEY ("job_requisition_id") REFERENCES "public"."job_requisitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_prospects" ADD CONSTRAINT "recruitment_prospects_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_prospects" ADD CONSTRAINT "recruitment_prospects_advertisement_id_advertisements_id_fk" FOREIGN KEY ("advertisement_id") REFERENCES "public"."advertisements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_prospects" ADD CONSTRAINT "recruitment_prospects_screened_by_user_id_users_id_fk" FOREIGN KEY ("screened_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "immigration_cases" ADD CONSTRAINT "immigration_cases_beneficiary_person_id_persons_id_fk" FOREIGN KEY ("beneficiary_person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "immigration_cases" ADD CONSTRAINT "immigration_cases_sponsor_employer_id_employers_id_fk" FOREIGN KEY ("sponsor_employer_id") REFERENCES "public"."employers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "immigration_cases" ADD CONSTRAINT "immigration_cases_related_placement_id_placements_id_fk" FOREIGN KEY ("related_placement_id") REFERENCES "public"."placements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "immigration_cases" ADD CONSTRAINT "immigration_cases_related_job_requisition_id_job_requisitions_id_fk" FOREIGN KEY ("related_job_requisition_id") REFERENCES "public"."job_requisitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "immigration_cases" ADD CONSTRAINT "immigration_cases_service_engagement_id_service_engagements_id_fk" FOREIGN KEY ("service_engagement_id") REFERENCES "public"."service_engagements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "communication_logs_person_idx" ON "communication_logs" USING btree ("person_id","occurred_at");--> statement-breakpoint
CREATE INDEX "communication_logs_employer_idx" ON "communication_logs" USING btree ("employer_id","occurred_at");--> statement-breakpoint
CREATE INDEX "communication_logs_requisition_idx" ON "communication_logs" USING btree ("job_requisition_id","occurred_at");--> statement-breakpoint
CREATE INDEX "communication_logs_occurred_idx" ON "communication_logs" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "tasks_assigned_status_due_idx" ON "tasks" USING btree ("assigned_user_id","status","due_at");--> statement-breakpoint
CREATE INDEX "tasks_person_idx" ON "tasks" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "tasks_employer_idx" ON "tasks" USING btree ("employer_id");--> statement-breakpoint
CREATE INDEX "advertisements_campaign_idx" ON "advertisements" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "advertisements_expiry_idx" ON "advertisements" USING btree ("expiry_date");--> statement-breakpoint
CREATE INDEX "recruitment_campaigns_requisition_idx" ON "recruitment_campaigns" USING btree ("job_requisition_id");--> statement-breakpoint
CREATE INDEX "recruitment_prospects_ad_idx" ON "recruitment_prospects" USING btree ("advertisement_id");--> statement-breakpoint
CREATE INDEX "immigration_cases_beneficiary_type_idx" ON "immigration_cases" USING btree ("beneficiary_person_id","case_type");--> statement-breakpoint
CREATE INDEX "immigration_cases_sponsor_idx" ON "immigration_cases" USING btree ("sponsor_employer_id");--> statement-breakpoint
CREATE INDEX "immigration_cases_status_idx" ON "immigration_cases" USING btree ("status");--> statement-breakpoint
CREATE INDEX "immigration_cases_expires_idx" ON "immigration_cases" USING btree ("expires_on");