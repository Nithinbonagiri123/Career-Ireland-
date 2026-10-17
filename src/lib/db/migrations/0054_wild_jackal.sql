CREATE TABLE "pro_forma_payment_refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"pro_forma_invoice_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency_code" text NOT NULL,
	"reason" text NOT NULL,
	"method" text NOT NULL,
	"reference" text,
	"idempotency_key" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"issued_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pf_payment_refunds_idempotency_unique" UNIQUE("payment_id","idempotency_key"),
	CONSTRAINT "pf_payment_refunds_amount_pos" CHECK ("pro_forma_payment_refunds"."amount" > 0),
	CONSTRAINT "pf_payment_refunds_method_check" CHECK ("pro_forma_payment_refunds"."method" IN ('BANK_TRANSFER','CASH','OTHER'))
);
--> statement-breakpoint
ALTER TABLE "pro_forma_payment_refunds" ADD CONSTRAINT "pro_forma_payment_refunds_pro_forma_invoice_id_pro_forma_invoices_id_fk" FOREIGN KEY ("pro_forma_invoice_id") REFERENCES "public"."pro_forma_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_forma_payment_refunds" ADD CONSTRAINT "pro_forma_payment_refunds_issued_by_user_id_users_id_fk" FOREIGN KEY ("issued_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pf_payment_refunds_payment_idx" ON "pro_forma_payment_refunds" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "pf_payment_refunds_proforma_idx" ON "pro_forma_payment_refunds" USING btree ("pro_forma_invoice_id");--> statement-breakpoint
-- Payment FK + currency FK added here (not in the drizzle schema) because
-- importing payments from commerce.ts into proformas.ts would create a
-- circular TS import: commerce.ts already references proFormaInvoices
-- on payments.pro_forma_invoice_id. The DB-level FK is still enforced.
ALTER TABLE "pro_forma_payment_refunds"
  ADD CONSTRAINT "pf_payment_refunds_payment_fk"
  FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id");--> statement-breakpoint
ALTER TABLE "pro_forma_payment_refunds"
  ADD CONSTRAINT "pf_payment_refunds_currency_fk"
  FOREIGN KEY ("currency_code") REFERENCES "public"."currencies"("code");