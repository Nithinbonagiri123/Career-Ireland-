CREATE TABLE "work_permit_checklists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_requisition_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"contract_signed_on" date,
	"commencement_date" date,
	"match_checks" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"advert_info_checks" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"documents_checks" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"created_by_user_id" uuid NOT NULL,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_permit_checklists_req_person_uniq" UNIQUE("job_requisition_id","person_id")
);
--> statement-breakpoint
ALTER TABLE "work_permit_checklists" ADD CONSTRAINT "work_permit_checklists_job_requisition_id_job_requisitions_id_fk" FOREIGN KEY ("job_requisition_id") REFERENCES "public"."job_requisitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_permit_checklists" ADD CONSTRAINT "work_permit_checklists_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_permit_checklists" ADD CONSTRAINT "work_permit_checklists_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_permit_checklists" ADD CONSTRAINT "work_permit_checklists_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "work_permit_checklists_req_idx" ON "work_permit_checklists" USING btree ("job_requisition_id");--> statement-breakpoint
CREATE INDEX "work_permit_checklists_person_idx" ON "work_permit_checklists" USING btree ("person_id");