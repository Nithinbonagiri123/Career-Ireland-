CREATE TABLE "attendance_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"clock_in_at" timestamp with time zone DEFAULT now() NOT NULL,
	"clock_in_ip" varchar(64),
	"clock_out_at" timestamp with time zone,
	"clock_out_ip" varchar(64),
	"auto_closed" boolean DEFAULT false NOT NULL,
	"correction_reason" text,
	"corrected_by_user_id" uuid,
	"corrected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_sessions_clock_out_after_in" CHECK ("attendance_sessions"."clock_out_at" IS NULL OR "attendance_sessions"."clock_out_at" > "attendance_sessions"."clock_in_at")
);
--> statement-breakpoint
CREATE TABLE "staff_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"department" varchar(120),
	"position" varchar(120),
	"joining_date" date,
	"manager_user_id" uuid,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_corrected_by_user_id_users_id_fk" FOREIGN KEY ("corrected_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_manager_user_id_users_id_fk" FOREIGN KEY ("manager_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_sessions_one_open_per_user" ON "attendance_sessions" USING btree ("user_id") WHERE "attendance_sessions"."clock_out_at" IS NULL;--> statement-breakpoint
CREATE INDEX "attendance_sessions_user_idx" ON "attendance_sessions" USING btree ("user_id","clock_in_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "attendance_sessions_clock_in_idx" ON "attendance_sessions" USING btree ("clock_in_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "staff_profiles_manager_idx" ON "staff_profiles" USING btree ("manager_user_id");