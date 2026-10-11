-- Session 34 — user-editable business-line tags for services. The owner
-- defines categories (Candidate Services, Recruitment, Immigration, …)
-- from the admin UI; services optionally reference one. Adding a new
-- business line in the future is a one-row insert, no code change.

CREATE TABLE "service_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" varchar(60) NOT NULL,
  "name" varchar(120) NOT NULL,
  "description" text,
  "display_order" integer NOT NULL DEFAULT 100,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "service_categories_slug_unique" UNIQUE("slug")
);

CREATE INDEX "service_categories_active_order_idx"
  ON "service_categories" ("is_active", "display_order");

ALTER TABLE "service_catalog_items"
  ADD COLUMN "category_id" uuid;

ALTER TABLE "service_catalog_items"
  ADD CONSTRAINT "service_catalog_items_category_id_fk"
  FOREIGN KEY ("category_id") REFERENCES "service_categories"("id") ON DELETE SET NULL;
