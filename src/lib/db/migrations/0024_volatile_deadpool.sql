CREATE TABLE "attendance_break_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attendance_session_id" uuid NOT NULL,
	"break_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"break_ended_at" timestamp with time zone,
	"duration_minutes" text,
	"auto_closed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_break_sessions_end_after_start" CHECK ("attendance_break_sessions"."break_ended_at" IS NULL OR "attendance_break_sessions"."break_ended_at" > "attendance_break_sessions"."break_started_at")
);
--> statement-breakpoint
CREATE TABLE "user_permissions" (
	"user_id" uuid NOT NULL,
	"business" text NOT NULL,
	"module" text NOT NULL,
	"verb" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"granted_by_user_id" uuid,
	CONSTRAINT "user_permissions_user_id_business_module_verb_pk" PRIMARY KEY("user_id","business","module","verb")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_owner" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "current_workspace" text;--> statement-breakpoint
ALTER TABLE "attendance_break_sessions" ADD CONSTRAINT "attendance_break_sessions_attendance_session_id_attendance_sessions_id_fk" FOREIGN KEY ("attendance_session_id") REFERENCES "public"."attendance_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_break_sessions_one_open_per_session" ON "attendance_break_sessions" USING btree ("attendance_session_id") WHERE "attendance_break_sessions"."break_ended_at" IS NULL;--> statement-breakpoint
CREATE INDEX "attendance_break_sessions_session_idx" ON "attendance_break_sessions" USING btree ("attendance_session_id");--> statement-breakpoint
CREATE INDEX "user_permissions_user_idx" ON "user_permissions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_single_owner" ON "users" USING btree ("is_owner") WHERE "users"."is_owner" = true;