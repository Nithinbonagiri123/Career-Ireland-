CREATE TABLE "accounting_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"status" varchar(20) DEFAULT 'OPEN' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounting_periods_year_month_unique" UNIQUE("year","month"),
	CONSTRAINT "accounting_periods_month_range" CHECK ("accounting_periods"."month" BETWEEN 1 AND 12),
	CONSTRAINT "accounting_periods_year_range" CHECK ("accounting_periods"."year" BETWEEN 2020 AND 2100),
	CONSTRAINT "accounting_periods_status_check" CHECK ("accounting_periods"."status" IN ('OPEN','SOFT_CLOSED','CLOSED','LOCKED'))
);
--> statement-breakpoint
CREATE TABLE "accounting_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" varchar(60) NOT NULL,
	"division_code" varchar(40),
	"currency_code" char(3),
	"condition_json" jsonb,
	"debit_account_code" varchar(10) NOT NULL,
	"credit_account_code" varchar(10) NOT NULL,
	"line_role" varchar(20) NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounting_rules_key_unique" UNIQUE("event_type","division_code","currency_code","line_role","effective_from"),
	CONSTRAINT "accounting_rules_line_role_check" CHECK ("accounting_rules"."line_role" IN ('PRINCIPAL','TAX','FEE','DISCOUNT'))
);
--> statement-breakpoint
CREATE TABLE "business_divisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(80) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_divisions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "chart_of_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(10) NOT NULL,
	"name" text NOT NULL,
	"type" varchar(20) NOT NULL,
	"parent_account_id" uuid,
	"currency_code" char(3),
	"tax_category" varchar(40),
	"active" boolean DEFAULT true NOT NULL,
	"allow_posting" boolean DEFAULT true NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chart_of_accounts_code_unique" UNIQUE("code"),
	CONSTRAINT "chart_of_accounts_type_check" CHECK ("chart_of_accounts"."type" IN ('ASSET','LIABILITY','EQUITY','REVENUE','COST_OF_SALES','EXPENSE','OTHER_INCOME','OTHER_EXPENSE'))
);
--> statement-breakpoint
CREATE TABLE "financial_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" varchar(60) NOT NULL,
	"source_system" varchar(40) NOT NULL,
	"source_module" varchar(40) NOT NULL,
	"source_entity" varchar(40) NOT NULL,
	"source_id" varchar(60) NOT NULL,
	"source_event_id" varchar(100) NOT NULL,
	"event_date" date NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"journal_id" uuid,
	"status" varchar(20) DEFAULT 'RECEIVED' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_events_source_unique" UNIQUE("source_system","source_event_id"),
	CONSTRAINT "financial_events_status_check" CHECK ("financial_events"."status" IN ('RECEIVED','PROCESSING','PROCESSED','FAILED','MANUAL_REVIEW'))
);
--> statement-breakpoint
CREATE TABLE "journal_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journal_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"account_id" uuid NOT NULL,
	"division_id" uuid,
	"debit" numeric(14, 2) DEFAULT '0' NOT NULL,
	"credit" numeric(14, 2) DEFAULT '0' NOT NULL,
	"foreign_debit" numeric(14, 2) DEFAULT '0' NOT NULL,
	"foreign_credit" numeric(14, 2) DEFAULT '0' NOT NULL,
	"currency_code" char(3) NOT NULL,
	"customer_person_id" uuid,
	"customer_employer_id" uuid,
	"service_engagement_id" uuid,
	"tax_code" varchar(40),
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_lines_journal_line_unique" UNIQUE("journal_id","line_number"),
	CONSTRAINT "journal_lines_debit_credit_nonneg" CHECK ("journal_lines"."debit" >= 0 AND "journal_lines"."credit" >= 0),
	CONSTRAINT "journal_lines_debit_xor_credit" CHECK (("journal_lines"."debit" = 0) <> ("journal_lines"."credit" = 0))
);
--> statement-breakpoint
CREATE TABLE "journals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" varchar(24) NOT NULL,
	"journal_date" date NOT NULL,
	"posting_date" date NOT NULL,
	"period_id" uuid NOT NULL,
	"transaction_currency" char(3) NOT NULL,
	"functional_currency" char(3) DEFAULT 'EUR' NOT NULL,
	"exchange_rate" numeric(18, 8) DEFAULT '1' NOT NULL,
	"description" text NOT NULL,
	"source_type" varchar(60),
	"source_event_id" uuid,
	"status" varchar(20) DEFAULT 'DRAFT' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"posted_by_user_id" uuid,
	"posted_at" timestamp with time zone,
	"reverses_journal_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journals_number_unique" UNIQUE("number"),
	CONSTRAINT "journals_status_check" CHECK ("journals"."status" IN ('DRAFT','PENDING_APPROVAL','POSTED','REVERSED','VOID'))
);
--> statement-breakpoint
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_parent_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("parent_account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_currency_code_currencies_code_fk" FOREIGN KEY ("currency_code") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_events" ADD CONSTRAINT "financial_events_journal_id_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."journals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_journal_id_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."journals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_division_id_business_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."business_divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_currency_code_currencies_code_fk" FOREIGN KEY ("currency_code") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_customer_person_id_persons_id_fk" FOREIGN KEY ("customer_person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_customer_employer_id_employers_id_fk" FOREIGN KEY ("customer_employer_id") REFERENCES "public"."employers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_service_engagement_id_service_engagements_id_fk" FOREIGN KEY ("service_engagement_id") REFERENCES "public"."service_engagements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journals" ADD CONSTRAINT "journals_period_id_accounting_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."accounting_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journals" ADD CONSTRAINT "journals_transaction_currency_currencies_code_fk" FOREIGN KEY ("transaction_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journals" ADD CONSTRAINT "journals_functional_currency_currencies_code_fk" FOREIGN KEY ("functional_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journals" ADD CONSTRAINT "journals_source_event_id_financial_events_id_fk" FOREIGN KEY ("source_event_id") REFERENCES "public"."financial_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journals" ADD CONSTRAINT "journals_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journals" ADD CONSTRAINT "journals_posted_by_user_id_users_id_fk" FOREIGN KEY ("posted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journals" ADD CONSTRAINT "journals_reverses_journal_id_journals_id_fk" FOREIGN KEY ("reverses_journal_id") REFERENCES "public"."journals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounting_rules_event_idx" ON "accounting_rules" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "chart_of_accounts_type_idx" ON "chart_of_accounts" USING btree ("type");--> statement-breakpoint
CREATE INDEX "chart_of_accounts_parent_idx" ON "chart_of_accounts" USING btree ("parent_account_id");--> statement-breakpoint
CREATE INDEX "financial_events_status_idx" ON "financial_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "financial_events_type_idx" ON "financial_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "journal_lines_account_idx" ON "journal_lines" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "journal_lines_division_idx" ON "journal_lines" USING btree ("division_id");--> statement-breakpoint
CREATE INDEX "journal_lines_customer_person_idx" ON "journal_lines" USING btree ("customer_person_id");--> statement-breakpoint
CREATE INDEX "journal_lines_customer_employer_idx" ON "journal_lines" USING btree ("customer_employer_id");--> statement-breakpoint
CREATE INDEX "journals_period_idx" ON "journals" USING btree ("period_id");--> statement-breakpoint
CREATE INDEX "journals_status_idx" ON "journals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "journals_source_event_idx" ON "journals" USING btree ("source_event_id");--> statement-breakpoint
CREATE INDEX "journals_posting_date_idx" ON "journals" USING btree ("posting_date");--> statement-breakpoint

-- ─── Double-entry invariant: sum(debit) = sum(credit) per journal ──
--
-- Enforced by a DEFERRED trigger so multi-line journals can be inserted
-- row-by-row in one transaction without the intermediate (unbalanced)
-- state tripping the check. Service layer wraps the whole post in a
-- transaction; this trigger fires at COMMIT time.

CREATE OR REPLACE FUNCTION ic_journal_balance_check()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
DECLARE
  d numeric(14, 2);
  c numeric(14, 2);
  j uuid;
BEGIN
  j := COALESCE(NEW.journal_id, OLD.journal_id);
  SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
    INTO d, c
    FROM journal_lines
   WHERE journal_id = j;
  IF d <> c THEN
    RAISE EXCEPTION
      'journal % is unbalanced: debits=% credits=% (diff=%)',
      j, d, c, (d - c)
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint

CREATE CONSTRAINT TRIGGER journal_lines_balance_check
  AFTER INSERT OR UPDATE OR DELETE ON journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION ic_journal_balance_check();
--> statement-breakpoint

-- ─── Posted-journal immutability ───────────────────────────────────
--
-- Once a journal is POSTED the row cannot be edited. The ONLY permitted
-- UPDATE is the status flip POSTED → REVERSED that also sets
-- reverses_journal_id (used by the reversal workflow). Everything else
-- raises an error — corrections happen by posting a NEW reversal +
-- replacement journal, never by editing the original.

CREATE OR REPLACE FUNCTION ic_journal_immutability_check()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'POSTED' THEN
    -- Allow the single legal transition: POSTED -> REVERSED.
    IF NEW.status = 'REVERSED'
       AND OLD.status = 'POSTED'
       AND NEW.id = OLD.id
       AND NEW.number = OLD.number
       AND NEW.journal_date = OLD.journal_date
       AND NEW.posting_date = OLD.posting_date
       AND NEW.period_id = OLD.period_id
       AND NEW.transaction_currency = OLD.transaction_currency
       AND NEW.functional_currency = OLD.functional_currency
       AND NEW.exchange_rate = OLD.exchange_rate
       AND NEW.description = OLD.description
       AND NEW.created_by_user_id = OLD.created_by_user_id
       AND NEW.posted_by_user_id IS NOT DISTINCT FROM OLD.posted_by_user_id
       AND NEW.posted_at IS NOT DISTINCT FROM OLD.posted_at
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION
      'journal % is POSTED and immutable (status % -> %); post a reversal journal instead',
      OLD.id, OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER journals_immutability_check
  BEFORE UPDATE ON journals
  FOR EACH ROW
  EXECUTE FUNCTION ic_journal_immutability_check();
