CREATE TABLE "candidate_qualifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"qualification_id" uuid NOT NULL,
	"awarded_on" date,
	"institution" varchar(200),
	"reference_number" varchar(120),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_quals_person_qual_unique" UNIQUE("person_id","qualification_id")
);
--> statement-breakpoint
CREATE TABLE "candidate_skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"proficiency" text DEFAULT 'INTERMEDIATE' NOT NULL,
	"years_experience" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_skills_person_skill_unique" UNIQUE("person_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "employment_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"employer_name" varchar(200) NOT NULL,
	"job_title" varchar(200),
	"location" varchar(200),
	"start_date" date,
	"end_date" date,
	"is_current" boolean DEFAULT false NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employment_history_dates_ordered" CHECK ("employment_history"."end_date" IS NULL OR "employment_history"."start_date" IS NULL OR "employment_history"."end_date" >= "employment_history"."start_date"),
	CONSTRAINT "employment_history_current_no_end" CHECK ("employment_history"."is_current" = false OR "employment_history"."end_date" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "candidate_email_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"email_address" varchar(200) NOT NULL,
	"password_ciphertext" text NOT NULL,
	"provider" text DEFAULT 'GMAIL' NOT NULL,
	"imap_host" varchar(120),
	"imap_port" integer,
	"imap_secure" boolean DEFAULT true NOT NULL,
	"smtp_host" varchar(120),
	"smtp_port" integer,
	"smtp_secure" boolean DEFAULT true NOT NULL,
	"shared_with_candidate_at" timestamp with time zone,
	"last_rotated_at" timestamp with time zone,
	"notes" text,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_email_accounts_person_id_unique" UNIQUE("person_id")
);
--> statement-breakpoint
CREATE TABLE "immigration_case_document_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"immigration_case_id" uuid NOT NULL,
	"document_type_id" uuid NOT NULL,
	"status" text DEFAULT 'MISSING' NOT NULL,
	"is_mandatory" text DEFAULT 'MANDATORY' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "imm_case_doc_req_case_type_unique" UNIQUE("immigration_case_id","document_type_id")
);
--> statement-breakpoint
CREATE TABLE "immigration_case_documents" (
	"immigration_case_id" uuid NOT NULL,
	"document_instance_id" uuid NOT NULL,
	"case_requirement_id" uuid,
	"attached_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attached_by_user_id" uuid NOT NULL,
	CONSTRAINT "immigration_case_documents_immigration_case_id_document_instance_id_pk" PRIMARY KEY("immigration_case_id","document_instance_id")
);
--> statement-breakpoint
CREATE TABLE "requisition_qualifications" (
	"job_requisition_id" uuid NOT NULL,
	"qualification_id" uuid NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requisition_qualifications_job_requisition_id_qualification_id_pk" PRIMARY KEY("job_requisition_id","qualification_id")
);
--> statement-breakpoint
CREATE TABLE "requisition_skills" (
	"job_requisition_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requisition_skills_job_requisition_id_skill_id_pk" PRIMARY KEY("job_requisition_id","skill_id")
);
--> statement-breakpoint
ALTER TABLE "job_applications" ALTER COLUMN "job_requisition_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "job_applications" ADD COLUMN "source" text DEFAULT 'INTERNAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "job_applications" ADD COLUMN "external_job_url" varchar(500);--> statement-breakpoint
ALTER TABLE "job_applications" ADD COLUMN "external_company_name" varchar(200);--> statement-breakpoint
ALTER TABLE "job_applications" ADD COLUMN "external_job_title" varchar(200);--> statement-breakpoint
ALTER TABLE "job_applications" ADD COLUMN "external_job_reference" varchar(200);--> statement-breakpoint
ALTER TABLE "job_applications" ADD COLUMN "cv_document_instance_id" uuid;--> statement-breakpoint
ALTER TABLE "job_applications" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "candidate_qualifications" ADD CONSTRAINT "candidate_qualifications_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_qualifications" ADD CONSTRAINT "candidate_qualifications_qualification_id_qualifications_id_fk" FOREIGN KEY ("qualification_id") REFERENCES "public"."qualifications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_skills" ADD CONSTRAINT "candidate_skills_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_skills" ADD CONSTRAINT "candidate_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employment_history" ADD CONSTRAINT "employment_history_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_email_accounts" ADD CONSTRAINT "candidate_email_accounts_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_email_accounts" ADD CONSTRAINT "candidate_email_accounts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "immigration_case_document_requirements" ADD CONSTRAINT "immigration_case_document_requirements_immigration_case_id_immigration_cases_id_fk" FOREIGN KEY ("immigration_case_id") REFERENCES "public"."immigration_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "immigration_case_document_requirements" ADD CONSTRAINT "immigration_case_document_requirements_document_type_id_document_types_id_fk" FOREIGN KEY ("document_type_id") REFERENCES "public"."document_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "immigration_case_documents" ADD CONSTRAINT "immigration_case_documents_immigration_case_id_immigration_cases_id_fk" FOREIGN KEY ("immigration_case_id") REFERENCES "public"."immigration_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "immigration_case_documents" ADD CONSTRAINT "immigration_case_documents_document_instance_id_document_instances_id_fk" FOREIGN KEY ("document_instance_id") REFERENCES "public"."document_instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "immigration_case_documents" ADD CONSTRAINT "immigration_case_documents_case_requirement_id_immigration_case_document_requirements_id_fk" FOREIGN KEY ("case_requirement_id") REFERENCES "public"."immigration_case_document_requirements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "immigration_case_documents" ADD CONSTRAINT "immigration_case_documents_attached_by_user_id_users_id_fk" FOREIGN KEY ("attached_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_qualifications" ADD CONSTRAINT "requisition_qualifications_job_requisition_id_job_requisitions_id_fk" FOREIGN KEY ("job_requisition_id") REFERENCES "public"."job_requisitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_qualifications" ADD CONSTRAINT "requisition_qualifications_qualification_id_qualifications_id_fk" FOREIGN KEY ("qualification_id") REFERENCES "public"."qualifications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_skills" ADD CONSTRAINT "requisition_skills_job_requisition_id_job_requisitions_id_fk" FOREIGN KEY ("job_requisition_id") REFERENCES "public"."job_requisitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_skills" ADD CONSTRAINT "requisition_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "candidate_quals_person_idx" ON "candidate_qualifications" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "candidate_skills_person_idx" ON "candidate_skills" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "candidate_skills_skill_idx" ON "candidate_skills" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "employment_history_person_idx" ON "employment_history" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "candidate_email_accounts_email_idx" ON "candidate_email_accounts" USING btree ("email_address");--> statement-breakpoint
CREATE INDEX "candidate_email_accounts_person_idx" ON "candidate_email_accounts" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "imm_case_doc_req_status_idx" ON "immigration_case_document_requirements" USING btree ("status");--> statement-breakpoint
CREATE INDEX "imm_case_docs_document_idx" ON "immigration_case_documents" USING btree ("document_instance_id");--> statement-breakpoint
CREATE INDEX "requisition_quals_qual_idx" ON "requisition_qualifications" USING btree ("qualification_id");--> statement-breakpoint
CREATE INDEX "requisition_skills_skill_idx" ON "requisition_skills" USING btree ("skill_id");--> statement-breakpoint
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_cv_document_instance_id_document_instances_id_fk" FOREIGN KEY ("cv_document_instance_id") REFERENCES "public"."document_instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_applications_source_idx" ON "job_applications" USING btree ("source");--> statement-breakpoint
ALTER TABLE "persons" ADD CONSTRAINT "persons_normalized_email_unique" UNIQUE("normalized_email");--> statement-breakpoint
ALTER TABLE "persons" ADD CONSTRAINT "persons_normalized_phone_unique" UNIQUE("normalized_phone");--> statement-breakpoint
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_source_shape" CHECK (("job_applications"."source" = 'INTERNAL' AND "job_applications"."job_requisition_id" IS NOT NULL)
          OR ("job_applications"."source" <> 'INTERNAL' AND "job_applications"."external_company_name" IS NOT NULL));