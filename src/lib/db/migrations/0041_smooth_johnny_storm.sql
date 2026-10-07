CREATE TABLE "bill_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bill_id" uuid NOT NULL,
	"payment_date" date NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency_code" char(3) NOT NULL,
	"method" varchar(40) DEFAULT 'BANK_TRANSFER' NOT NULL,
	"reference" text,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bill_payments_amount_positive" CHECK ("bill_payments"."amount" > 0),
	CONSTRAINT "bill_payments_method_check" CHECK ("bill_payments"."method" IN ('BANK_TRANSFER','CARD','CASH','DIRECT_DEBIT','CHEQUE','OTHER'))
);
--> statement-breakpoint
CREATE TABLE "supplier_bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" varchar(24) NOT NULL,
	"supplier_id" uuid NOT NULL,
	"supplier_reference" varchar(100),
	"bill_date" date NOT NULL,
	"due_date" date NOT NULL,
	"currency_code" char(3) NOT NULL,
	"subtotal" numeric(14, 2) NOT NULL,
	"tax_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_amount" numeric(14, 2) NOT NULL,
	"expense_account_code" varchar(10) NOT NULL,
	"description" text NOT NULL,
	"status" varchar(20) DEFAULT 'POSTED' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_bills_number_unique" UNIQUE("number"),
	CONSTRAINT "supplier_bills_status_check" CHECK ("supplier_bills"."status" IN ('DRAFT','POSTED','PARTIALLY_PAID','PAID','VOID')),
	CONSTRAINT "supplier_bills_amount_check" CHECK ("supplier_bills"."subtotal" >= 0 AND "supplier_bills"."total_amount" >= 0),
	CONSTRAINT "supplier_bills_total_math" CHECK (ROUND("supplier_bills"."subtotal"::numeric + "supplier_bills"."tax_amount"::numeric, 2) = ROUND("supplier_bills"."total_amount"::numeric, 2))
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legal_name" varchar(200) NOT NULL,
	"trading_name" varchar(200),
	"email" varchar(200),
	"phone" varchar(50),
	"address" text,
	"tax_number" varchar(50),
	"country" char(2),
	"currency_code" char(3),
	"payment_terms_days" integer DEFAULT 30 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "tax_amount" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "bill_payments" ADD CONSTRAINT "bill_payments_bill_id_supplier_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."supplier_bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_payments" ADD CONSTRAINT "bill_payments_currency_code_currencies_code_fk" FOREIGN KEY ("currency_code") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_payments" ADD CONSTRAINT "bill_payments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_currency_code_currencies_code_fk" FOREIGN KEY ("currency_code") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_currency_code_currencies_code_fk" FOREIGN KEY ("currency_code") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bill_payments_bill_idx" ON "bill_payments" USING btree ("bill_id");--> statement-breakpoint
CREATE INDEX "bill_payments_date_idx" ON "bill_payments" USING btree ("payment_date");--> statement-breakpoint
CREATE INDEX "supplier_bills_supplier_idx" ON "supplier_bills" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "supplier_bills_status_idx" ON "supplier_bills" USING btree ("status");--> statement-breakpoint
CREATE INDEX "supplier_bills_due_date_idx" ON "supplier_bills" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "suppliers_name_idx" ON "suppliers" USING btree ("legal_name");--> statement-breakpoint
CREATE INDEX "suppliers_active_idx" ON "suppliers" USING btree ("is_active");--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_tax_nonneg" CHECK ("credit_notes"."tax_amount" >= 0);