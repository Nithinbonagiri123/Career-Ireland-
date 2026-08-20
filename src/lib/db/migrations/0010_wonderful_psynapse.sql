CREATE TABLE "candidate_document_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"document_type_id" uuid NOT NULL,
	"status" text DEFAULT 'MISSING' NOT NULL,
	"source_rule_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cand_doc_req_person_type_unique" UNIQUE("person_id","document_type_id")
);
--> statement-breakpoint
CREATE TABLE "document_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_person_id" uuid,
	"owner_employer_id" uuid,
	"document_type_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'UPLOADED' NOT NULL,
	"original_filename" varchar(255) NOT NULL,
	"mime_type" varchar(120) NOT NULL,
	"file_size_bytes" bigint NOT NULL,
	"s3_bucket" varchar(120) NOT NULL,
	"s3_object_key" varchar(500) NOT NULL,
	"uploaded_by_user_id" uuid NOT NULL,
	"expires_on" date,
	"review_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_instances_owner_xor" CHECK (("document_instances"."owner_person_id" IS NOT NULL) <> ("document_instances"."owner_employer_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "document_requirement_fulfillments" (
	"requirement_id" uuid NOT NULL,
	"document_instance_id" uuid NOT NULL,
	"fulfilled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fulfilled_by_user_id" uuid NOT NULL,
	CONSTRAINT "document_requirement_fulfillments_requirement_id_document_instance_id_pk" PRIMARY KEY("requirement_id","document_instance_id")
);
--> statement-breakpoint
CREATE TABLE "document_requirement_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_type_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"scope_ref_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "doc_req_rules_type_scope_unique" UNIQUE("document_type_id","scope","scope_ref_id"),
	CONSTRAINT "doc_req_rules_scope_ref_consistent" CHECK (("document_requirement_rules"."scope" = 'GLOBAL' AND "document_requirement_rules"."scope_ref_id" IS NULL) OR
          ("document_requirement_rules"."scope" <> 'GLOBAL' AND "document_requirement_rules"."scope_ref_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "candidate_document_requirements" ADD CONSTRAINT "candidate_document_requirements_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_document_requirements" ADD CONSTRAINT "candidate_document_requirements_document_type_id_document_types_id_fk" FOREIGN KEY ("document_type_id") REFERENCES "public"."document_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_document_requirements" ADD CONSTRAINT "candidate_document_requirements_source_rule_id_document_requirement_rules_id_fk" FOREIGN KEY ("source_rule_id") REFERENCES "public"."document_requirement_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_instances" ADD CONSTRAINT "document_instances_owner_person_id_persons_id_fk" FOREIGN KEY ("owner_person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_instances" ADD CONSTRAINT "document_instances_owner_employer_id_employers_id_fk" FOREIGN KEY ("owner_employer_id") REFERENCES "public"."employers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_instances" ADD CONSTRAINT "document_instances_document_type_id_document_types_id_fk" FOREIGN KEY ("document_type_id") REFERENCES "public"."document_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_instances" ADD CONSTRAINT "document_instances_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requirement_fulfillments" ADD CONSTRAINT "document_requirement_fulfillments_requirement_id_candidate_document_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."candidate_document_requirements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requirement_fulfillments" ADD CONSTRAINT "document_requirement_fulfillments_document_instance_id_document_instances_id_fk" FOREIGN KEY ("document_instance_id") REFERENCES "public"."document_instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requirement_fulfillments" ADD CONSTRAINT "document_requirement_fulfillments_fulfilled_by_user_id_users_id_fk" FOREIGN KEY ("fulfilled_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requirement_rules" ADD CONSTRAINT "document_requirement_rules_document_type_id_document_types_id_fk" FOREIGN KEY ("document_type_id") REFERENCES "public"."document_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cand_doc_req_status_idx" ON "candidate_document_requirements" USING btree ("status");--> statement-breakpoint
CREATE INDEX "document_instances_owner_person_idx" ON "document_instances" USING btree ("owner_person_id","document_type_id");--> statement-breakpoint
CREATE INDEX "document_instances_owner_employer_idx" ON "document_instances" USING btree ("owner_employer_id","document_type_id");--> statement-breakpoint
CREATE INDEX "document_instances_status_idx" ON "document_instances" USING btree ("status");--> statement-breakpoint
CREATE INDEX "document_instances_expiry_idx" ON "document_instances" USING btree ("expires_on");--> statement-breakpoint
CREATE INDEX "doc_req_rules_scope_idx" ON "document_requirement_rules" USING btree ("scope","scope_ref_id");