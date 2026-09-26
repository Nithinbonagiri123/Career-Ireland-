CREATE TABLE "immigration_application_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "immigration_application_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "immigration_cases" ADD COLUMN "application_type_id" uuid;--> statement-breakpoint
ALTER TABLE "immigration_application_types" ADD CONSTRAINT "immigration_application_types_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "immigration_application_types_category_idx" ON "immigration_application_types" USING btree ("category");--> statement-breakpoint
CREATE INDEX "immigration_application_types_active_idx" ON "immigration_application_types" USING btree ("is_active");--> statement-breakpoint
ALTER TABLE "immigration_cases" ADD CONSTRAINT "immigration_cases_application_type_id_immigration_application_types_id_fk" FOREIGN KEY ("application_type_id") REFERENCES "public"."immigration_application_types"("id") ON DELETE no action ON UPDATE no action;