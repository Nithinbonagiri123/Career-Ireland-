CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"user_id" uuid NOT NULL,
	"requested_email" "citext" NOT NULL,
	"requested_ip" varchar(64),
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"used_ip" varchar(64),
	CONSTRAINT "password_reset_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "password_reset_tokens_user_idx" ON "password_reset_tokens" USING btree ("user_id","requested_at");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_email_idx" ON "password_reset_tokens" USING btree ("requested_email","requested_at");