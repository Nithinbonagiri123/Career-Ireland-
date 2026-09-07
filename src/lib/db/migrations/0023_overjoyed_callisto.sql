ALTER TABLE "users" DROP CONSTRAINT "users_role_check";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_portal_scope_check";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("users"."role" IN ('ADMIN','STAFF','MANAGER','RECRUITER','DOCUMENT_SPECIALIST','FINANCE','CANDIDATE','EMPLOYER'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_portal_scope_check" CHECK ((
        ("users"."role" IN ('ADMIN','STAFF','MANAGER','RECRUITER','DOCUMENT_SPECIALIST','FINANCE') AND "users"."person_id" IS NULL AND "users"."employer_id" IS NULL) OR
        ("users"."role" = 'CANDIDATE' AND "users"."person_id" IS NOT NULL AND "users"."employer_id" IS NULL) OR
        ("users"."role" = 'EMPLOYER' AND "users"."employer_id" IS NOT NULL AND "users"."person_id" IS NULL)
      ));