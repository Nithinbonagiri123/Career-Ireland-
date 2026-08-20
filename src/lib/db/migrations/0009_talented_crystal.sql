CREATE TABLE "portal_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" varchar(64) NOT NULL,
	"user_type" text NOT NULL,
	"person_id" uuid,
	"employer_id" uuid,
	"email" "citext" NOT NULL,
	"full_name" varchar(200) NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_user_id" uuid,
	CONSTRAINT "portal_invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_role_check";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "person_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "employer_id" uuid;--> statement-breakpoint
ALTER TABLE "portal_invitations" ADD CONSTRAINT "portal_invitations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_invitations" ADD CONSTRAINT "portal_invitations_accepted_user_id_users_id_fk" FOREIGN KEY ("accepted_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_portal_scope_check" CHECK ((
        ("users"."role" = 'ADMIN' AND "users"."person_id" IS NULL AND "users"."employer_id" IS NULL) OR
        ("users"."role" = 'STAFF' AND "users"."person_id" IS NULL AND "users"."employer_id" IS NULL) OR
        ("users"."role" = 'CANDIDATE' AND "users"."person_id" IS NOT NULL AND "users"."employer_id" IS NULL) OR
        ("users"."role" = 'EMPLOYER' AND "users"."employer_id" IS NOT NULL AND "users"."person_id" IS NULL)
      ));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("users"."role" IN ('ADMIN','STAFF','CANDIDATE','EMPLOYER'));