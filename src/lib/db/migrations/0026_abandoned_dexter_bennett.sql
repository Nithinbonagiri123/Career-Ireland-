CREATE TABLE "app_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"legal_name" text NOT NULL,
	"full_legal_name" text NOT NULL,
	"address_lines" jsonb NOT NULL,
	"contact_email" text NOT NULL,
	"contact_phone" text,
	"registration_number" text,
	"vat_number" text,
	"bank_name" text,
	"bank_account_name" text,
	"bank_iban" text,
	"bank_bic" text,
	"invoice_footer" text NOT NULL,
	"receipt_footer" text NOT NULL,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_settings_singleton" CHECK ("app_settings"."id" = 'global')
);
--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Seed the singleton row from the previous hardcoded COMPANY_INFO
-- constant so existing invoice/receipt renders keep working after
-- the code switches to reading from this table. Idempotent — a
-- subsequent migration re-run leaves an existing row untouched.
INSERT INTO "app_settings" (
  "id",
  "legal_name",
  "full_legal_name",
  "address_lines",
  "contact_email",
  "registration_number",
  "vat_number",
  "bank_name",
  "bank_account_name",
  "bank_iban",
  "bank_bic",
  "invoice_footer",
  "receipt_footer"
) VALUES (
  'global',
  'Ireland Career Gateway',
  'Leon De Wit t/a Ireland Career Gateway',
  '["Rosslare Harbour", "Wexford, Y35 YH22", "Ireland"]'::jsonb,
  'billing@irelandcareergateway.ie',
  '[RBN — TBC]',
  '[VAT — not yet registered]',
  'Bank of Ireland',
  'Leon De Wit t/a Ireland Career Gateway',
  'IE44BOFI90671825127964',
  'BOFIEE2D',
  'Thank you for choosing Ireland Career Gateway.',
  'This receipt confirms the payment above has been received in full.'
) ON CONFLICT ("id") DO NOTHING;