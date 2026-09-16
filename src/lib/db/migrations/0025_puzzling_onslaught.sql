ALTER TABLE "tasks" ADD COLUMN "advertisement_id" uuid;--> statement-breakpoint
ALTER TABLE "advertisements" ADD COLUMN "reminder_on" date;--> statement-breakpoint
ALTER TABLE "immigration_cases" ADD COLUMN "reminder_on" date;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_advertisement_id_advertisements_id_fk" FOREIGN KEY ("advertisement_id") REFERENCES "public"."advertisements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_advertisement_idx" ON "tasks" USING btree ("advertisement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_advertisement_title_active_uidx" ON "tasks" USING btree ("advertisement_id","title") WHERE "tasks"."advertisement_id" IS NOT NULL AND "tasks"."status" IN ('OPEN', 'IN_PROGRESS') AND "tasks"."archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX "advertisements_reminder_idx" ON "advertisements" USING btree ("reminder_on");--> statement-breakpoint
CREATE INDEX "immigration_cases_reminder_idx" ON "immigration_cases" USING btree ("reminder_on");