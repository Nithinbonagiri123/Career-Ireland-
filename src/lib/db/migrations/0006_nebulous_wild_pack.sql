CREATE TABLE "candidate_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_requisition_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"score_bucket" text DEFAULT 'LOW' NOT NULL,
	"source" text DEFAULT 'ASSISTED' NOT NULL,
	"status" text DEFAULT 'SUGGESTED' NOT NULL,
	"suggested_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_matches_requisition_person_unique" UNIQUE("job_requisition_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "employer_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employer_id" uuid NOT NULL,
	"full_name" varchar(200) NOT NULL,
	"job_title" varchar(120),
	"email" varchar(200),
	"phone" varchar(30),
	"is_primary" boolean DEFAULT false NOT NULL,
	"person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legal_name" varchar(200) NOT NULL,
	"trading_name" varchar(200),
	"website" varchar(255),
	"industry" varchar(120),
	"country" varchar(80),
	"city" varchar(120),
	"relationship_status" text DEFAULT 'PROSPECT' NOT NULL,
	"assigned_user_id" uuid,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_requisition_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"status" text DEFAULT 'APPLIED' NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"interview_at" timestamp with time zone,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_applications_requisition_person_unique" UNIQUE("job_requisition_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "job_requisitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employer_id" uuid NOT NULL,
	"primary_contact_id" uuid,
	"title" varchar(200) NOT NULL,
	"occupation_id" uuid,
	"positions_required" integer DEFAULT 1 NOT NULL,
	"positions_filled" integer DEFAULT 0 NOT NULL,
	"location" varchar(200),
	"employment_type" text DEFAULT 'FULL_TIME' NOT NULL,
	"salary_min" numeric(14, 2),
	"salary_max" numeric(14, 2),
	"salary_currency_code" char(3),
	"description" text,
	"candidate_requirements" text,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"assigned_user_id" uuid,
	"target_fill_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "placements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"employer_id" uuid NOT NULL,
	"job_requisition_id" uuid NOT NULL,
	"job_application_id" uuid,
	"status" text DEFAULT 'PROPOSED' NOT NULL,
	"offer_date" date,
	"start_date" date,
	"end_date" date,
	"salary" numeric(14, 2),
	"salary_currency_code" char(3),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shortlist_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_requisition_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"candidate_match_id" uuid,
	"presented_to_employer_at" timestamp with time zone,
	"employer_feedback" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shortlist_entries_requisition_person_unique" UNIQUE("job_requisition_id","person_id")
);
--> statement-breakpoint
ALTER TABLE "candidate_matches" ADD CONSTRAINT "candidate_matches_job_requisition_id_job_requisitions_id_fk" FOREIGN KEY ("job_requisition_id") REFERENCES "public"."job_requisitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_matches" ADD CONSTRAINT "candidate_matches_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_matches" ADD CONSTRAINT "candidate_matches_suggested_by_user_id_users_id_fk" FOREIGN KEY ("suggested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employer_contacts" ADD CONSTRAINT "employer_contacts_employer_id_employers_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."employers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employer_contacts" ADD CONSTRAINT "employer_contacts_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employers" ADD CONSTRAINT "employers_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_job_requisition_id_job_requisitions_id_fk" FOREIGN KEY ("job_requisition_id") REFERENCES "public"."job_requisitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_requisitions" ADD CONSTRAINT "job_requisitions_employer_id_employers_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."employers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_requisitions" ADD CONSTRAINT "job_requisitions_primary_contact_id_employer_contacts_id_fk" FOREIGN KEY ("primary_contact_id") REFERENCES "public"."employer_contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_requisitions" ADD CONSTRAINT "job_requisitions_occupation_id_occupations_id_fk" FOREIGN KEY ("occupation_id") REFERENCES "public"."occupations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_requisitions" ADD CONSTRAINT "job_requisitions_salary_currency_code_currencies_code_fk" FOREIGN KEY ("salary_currency_code") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_requisitions" ADD CONSTRAINT "job_requisitions_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_employer_id_employers_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."employers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_job_requisition_id_job_requisitions_id_fk" FOREIGN KEY ("job_requisition_id") REFERENCES "public"."job_requisitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_job_application_id_job_applications_id_fk" FOREIGN KEY ("job_application_id") REFERENCES "public"."job_applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_salary_currency_code_currencies_code_fk" FOREIGN KEY ("salary_currency_code") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlist_entries" ADD CONSTRAINT "shortlist_entries_job_requisition_id_job_requisitions_id_fk" FOREIGN KEY ("job_requisition_id") REFERENCES "public"."job_requisitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlist_entries" ADD CONSTRAINT "shortlist_entries_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlist_entries" ADD CONSTRAINT "shortlist_entries_candidate_match_id_candidate_matches_id_fk" FOREIGN KEY ("candidate_match_id") REFERENCES "public"."candidate_matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "candidate_matches_requisition_bucket_idx" ON "candidate_matches" USING btree ("job_requisition_id","score_bucket");--> statement-breakpoint
CREATE INDEX "employer_contacts_employer_idx" ON "employer_contacts" USING btree ("employer_id");--> statement-breakpoint
CREATE INDEX "employers_legal_name_idx" ON "employers" USING btree ("legal_name");--> statement-breakpoint
CREATE INDEX "employers_status_idx" ON "employers" USING btree ("relationship_status");--> statement-breakpoint
CREATE INDEX "job_applications_person_status_idx" ON "job_applications" USING btree ("person_id","status");--> statement-breakpoint
CREATE INDEX "job_requisitions_employer_status_idx" ON "job_requisitions" USING btree ("employer_id","status");--> statement-breakpoint
CREATE INDEX "job_requisitions_occupation_idx" ON "job_requisitions" USING btree ("occupation_id");--> statement-breakpoint
CREATE INDEX "job_requisitions_assigned_idx" ON "job_requisitions" USING btree ("assigned_user_id");--> statement-breakpoint
CREATE INDEX "placements_person_idx" ON "placements" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "placements_employer_idx" ON "placements" USING btree ("employer_id");--> statement-breakpoint
CREATE INDEX "placements_status_idx" ON "placements" USING btree ("status");