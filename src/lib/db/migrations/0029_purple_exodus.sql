CREATE TABLE "document_upload_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"person_id" uuid NOT NULL,
	"requested_requirement_ids" jsonb NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_upload_requests_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "document_upload_requests" ADD CONSTRAINT "document_upload_requests_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_upload_requests" ADD CONSTRAINT "document_upload_requests_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_upload_requests" ADD CONSTRAINT "document_upload_requests_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_upload_requests_person_idx" ON "document_upload_requests" USING btree ("person_id","created_at");--> statement-breakpoint
CREATE INDEX "document_upload_requests_active_idx" ON "document_upload_requests" USING btree ("person_id") WHERE "document_upload_requests"."completed_at" IS NULL AND "document_upload_requests"."revoked_at" IS NULL;