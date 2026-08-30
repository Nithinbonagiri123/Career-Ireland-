ALTER TABLE "immigration_cases" ADD COLUMN "assigned_user_id" uuid;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD COLUMN "assigned_user_id" uuid;--> statement-breakpoint
ALTER TABLE "immigration_cases" ADD CONSTRAINT "immigration_cases_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD CONSTRAINT "candidate_profiles_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "immigration_cases_assigned_idx" ON "immigration_cases" USING btree ("assigned_user_id");--> statement-breakpoint
CREATE INDEX "leads_assigned_idx" ON "leads" USING btree ("assigned_user_id");--> statement-breakpoint
CREATE INDEX "candidate_profiles_assigned_idx" ON "candidate_profiles" USING btree ("assigned_user_id");--> statement-breakpoint
CREATE INDEX "employers_assigned_idx" ON "employers" USING btree ("assigned_user_id");