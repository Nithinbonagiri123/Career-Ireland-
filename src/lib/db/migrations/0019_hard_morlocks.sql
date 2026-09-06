DROP INDEX "tasks_immigration_case_title_active_uidx";--> statement-breakpoint
DROP INDEX "tasks_requisition_title_active_uidx";--> statement-breakpoint
DROP INDEX "tasks_engagement_title_active_uidx";--> statement-breakpoint
ALTER TABLE "communication_logs" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "communication_logs" ADD COLUMN "archived_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "archived_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "recruitment_campaigns" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "recruitment_campaigns" ADD COLUMN "archived_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "service_engagements" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "service_engagements" ADD COLUMN "archived_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "document_instances" ADD COLUMN "voided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "document_instances" ADD COLUMN "voided_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "document_instances" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "job_requisitions" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "job_requisitions" ADD COLUMN "archived_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "placements" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "placements" ADD COLUMN "archived_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "communication_logs" ADD CONSTRAINT "communication_logs_archived_by_user_id_users_id_fk" FOREIGN KEY ("archived_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_archived_by_user_id_users_id_fk" FOREIGN KEY ("archived_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_campaigns" ADD CONSTRAINT "recruitment_campaigns_archived_by_user_id_users_id_fk" FOREIGN KEY ("archived_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_engagements" ADD CONSTRAINT "service_engagements_archived_by_user_id_users_id_fk" FOREIGN KEY ("archived_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_instances" ADD CONSTRAINT "document_instances_voided_by_user_id_users_id_fk" FOREIGN KEY ("voided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_requisitions" ADD CONSTRAINT "job_requisitions_archived_by_user_id_users_id_fk" FOREIGN KEY ("archived_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_archived_by_user_id_users_id_fk" FOREIGN KEY ("archived_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_immigration_case_title_active_uidx" ON "tasks" USING btree ("immigration_case_id","title") WHERE "tasks"."immigration_case_id" IS NOT NULL AND "tasks"."status" IN ('OPEN', 'IN_PROGRESS') AND "tasks"."archived_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_requisition_title_active_uidx" ON "tasks" USING btree ("job_requisition_id","title") WHERE "tasks"."job_requisition_id" IS NOT NULL AND "tasks"."status" IN ('OPEN', 'IN_PROGRESS') AND "tasks"."archived_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_engagement_title_active_uidx" ON "tasks" USING btree ("service_engagement_id","title") WHERE "tasks"."service_engagement_id" IS NOT NULL AND "tasks"."status" IN ('OPEN', 'IN_PROGRESS') AND "tasks"."archived_at" IS NULL;