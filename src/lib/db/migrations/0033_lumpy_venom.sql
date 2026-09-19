CREATE TABLE "cv_extractions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_instance_id" uuid NOT NULL,
	"text_content" text NOT NULL,
	"parsed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cv_extractions_document_instance_id_unique" UNIQUE("document_instance_id")
);
--> statement-breakpoint
ALTER TABLE "cv_extractions" ADD CONSTRAINT "cv_extractions_document_instance_id_document_instances_id_fk" FOREIGN KEY ("document_instance_id") REFERENCES "public"."document_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cv_extractions_document_idx" ON "cv_extractions" USING btree ("document_instance_id");