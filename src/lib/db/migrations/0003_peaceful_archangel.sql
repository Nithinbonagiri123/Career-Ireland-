CREATE TABLE "currencies" (
	"code" char(3) PRIMARY KEY NOT NULL,
	"name" varchar(60) NOT NULL,
	"symbol" varchar(5) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "occupation_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "occupation_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "occupations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "occupations_category_name_unique" UNIQUE("category_id","name")
);
--> statement-breakpoint
ALTER TABLE "occupations" ADD CONSTRAINT "occupations_category_id_occupation_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."occupation_categories"("id") ON DELETE no action ON UPDATE no action;