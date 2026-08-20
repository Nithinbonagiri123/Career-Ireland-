CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"status" text DEFAULT 'NEW' NOT NULL,
	"service_of_interest_id" uuid,
	"assigned_user_id" uuid,
	"notes" text,
	"converted_at" timestamp with time zone,
	"converted_by_user_id" uuid,
	"conversion_method" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"primary_occupation_id" uuid,
	"years_of_experience" text,
	"work_eligibility" text,
	"preferred_location" varchar(200),
	"profile_summary" text,
	"lifecycle_status" text DEFAULT 'ACTIVE' NOT NULL,
	"availability_status" text DEFAULT 'AVAILABLE' NOT NULL,
	"activated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_profiles_person_id_unique" UNIQUE("person_id")
);
--> statement-breakpoint
CREATE TABLE "persons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"email" "citext",
	"normalized_email" "citext" GENERATED ALWAYS AS (lower(trim(email))) STORED,
	"phone" varchar(30),
	"normalized_phone" varchar(30) GENERATED ALWAYS AS (regexp_replace(phone, '[^0-9+]', '', 'g')) STORED,
	"date_of_birth" date,
	"nationality" varchar(80),
	"current_country" varchar(80),
	"current_city" varchar(120),
	"source" text DEFAULT 'DIRECT',
	"notes" text,
	"merged_into_person_id" uuid,
	"merged_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"archived_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(60) NOT NULL,
	"name" varchar(120) NOT NULL,
	"has_expiry" boolean DEFAULT false NOT NULL,
	"applies_to" text DEFAULT 'PERSON' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "qualifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qualifications_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skills_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "service_catalog_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(60) NOT NULL,
	"name" varchar(120) NOT NULL,
	"default_currency_code" char(3),
	"default_price" numeric(14, 2),
	"payer_type" text DEFAULT 'PERSON' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_catalog_items_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "service_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"service_catalog_item_id" uuid NOT NULL,
	"price" numeric(14, 2) NOT NULL,
	"currency_code" char(3) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_service_of_interest_id_service_catalog_items_id_fk" FOREIGN KEY ("service_of_interest_id") REFERENCES "public"."service_catalog_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_converted_by_user_id_users_id_fk" FOREIGN KEY ("converted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD CONSTRAINT "candidate_profiles_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persons" ADD CONSTRAINT "persons_merged_into_person_id_persons_id_fk" FOREIGN KEY ("merged_into_person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_catalog_items" ADD CONSTRAINT "service_catalog_items_default_currency_code_currencies_code_fk" FOREIGN KEY ("default_currency_code") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_packages" ADD CONSTRAINT "service_packages_service_catalog_item_id_service_catalog_items_id_fk" FOREIGN KEY ("service_catalog_item_id") REFERENCES "public"."service_catalog_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_packages" ADD CONSTRAINT "service_packages_currency_code_currencies_code_fk" FOREIGN KEY ("currency_code") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "persons_normalized_email_idx" ON "persons" USING btree ("normalized_email");--> statement-breakpoint
CREATE INDEX "persons_normalized_phone_idx" ON "persons" USING btree ("normalized_phone");--> statement-breakpoint
CREATE INDEX "persons_name_idx" ON "persons" USING btree ("last_name","first_name");--> statement-breakpoint
CREATE INDEX "persons_merged_idx" ON "persons" USING btree ("merged_into_person_id");