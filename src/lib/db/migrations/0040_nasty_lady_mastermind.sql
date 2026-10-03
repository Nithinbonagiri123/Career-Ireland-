CREATE TABLE "tax_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_date" date NOT NULL,
	"source_type" varchar(40) NOT NULL,
	"source_id" varchar(60) NOT NULL,
	"journal_id" uuid,
	"direction" varchar(10) NOT NULL,
	"tax_code" varchar(40) DEFAULT 'STANDARD' NOT NULL,
	"tax_rate_percent" numeric(5, 2) NOT NULL,
	"net_amount" numeric(14, 2) NOT NULL,
	"tax_amount" numeric(14, 2) NOT NULL,
	"currency_code" char(3) NOT NULL,
	"division_id" uuid,
	"customer_person_id" uuid,
	"customer_employer_id" uuid,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tax_transactions_source_unique" UNIQUE("source_type","source_id","direction"),
	CONSTRAINT "tax_transactions_direction_check" CHECK ("tax_transactions"."direction" IN ('OUTPUT','INPUT'))
);
--> statement-breakpoint
ALTER TABLE "tax_transactions" ADD CONSTRAINT "tax_transactions_journal_id_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."journals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_transactions" ADD CONSTRAINT "tax_transactions_currency_code_currencies_code_fk" FOREIGN KEY ("currency_code") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_transactions" ADD CONSTRAINT "tax_transactions_division_id_business_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."business_divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_transactions" ADD CONSTRAINT "tax_transactions_customer_person_id_persons_id_fk" FOREIGN KEY ("customer_person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_transactions" ADD CONSTRAINT "tax_transactions_customer_employer_id_employers_id_fk" FOREIGN KEY ("customer_employer_id") REFERENCES "public"."employers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tax_transactions_date_idx" ON "tax_transactions" USING btree ("transaction_date");--> statement-breakpoint
CREATE INDEX "tax_transactions_direction_date_idx" ON "tax_transactions" USING btree ("direction","transaction_date");--> statement-breakpoint
CREATE INDEX "tax_transactions_journal_idx" ON "tax_transactions" USING btree ("journal_id");