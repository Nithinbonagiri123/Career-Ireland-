CREATE TABLE "business_case_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module" text NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_case_types_module_name_unique" UNIQUE("module","name")
);
--> statement-breakpoint
ALTER TABLE "business_case_types" ADD CONSTRAINT "business_case_types_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "business_case_types_module_idx" ON "business_case_types" USING btree ("module");--> statement-breakpoint
CREATE INDEX "business_case_types_active_idx" ON "business_case_types" USING btree ("is_active");