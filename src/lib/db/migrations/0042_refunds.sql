-- Phase 1 UX blueprint §7.1 — refund flow.
-- Introduces the refunds table + two new payment statuses so money
-- returning to a payer is finally a first-class record in the CRM.

-- 1. Extend payments.status enum (text column — no enum type to alter).
ALTER TABLE "payments"
  DROP CONSTRAINT IF EXISTS "payments_status_check";

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_status_check"
  CHECK (
    "status" IN (
      'PENDING',
      'PROOF_UPLOADED',
      'VERIFIED',
      'REJECTED',
      'PARTIALLY_REFUNDED',
      'REFUNDED'
    )
  );

-- 2. Refunds table.
CREATE TABLE "refunds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "payment_id" uuid NOT NULL,
  "credit_note_id" uuid NOT NULL,
  "amount" numeric(14, 2) NOT NULL,
  "currency_code" char(3) NOT NULL,
  "reason" text NOT NULL,
  "method" text NOT NULL,
  "reference" text,
  "issued_at" timestamp with time zone DEFAULT now() NOT NULL,
  "issued_by_user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "refunds_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "refunds_method_check" CHECK ("method" IN ('BANK_TRANSFER', 'CASH', 'OTHER'))
);

ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_payment_id_fk"
  FOREIGN KEY ("payment_id") REFERENCES "payments"("id");

ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_credit_note_id_fk"
  FOREIGN KEY ("credit_note_id") REFERENCES "credit_notes"("id");

ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_currency_code_fk"
  FOREIGN KEY ("currency_code") REFERENCES "currencies"("code");

ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_issued_by_user_id_fk"
  FOREIGN KEY ("issued_by_user_id") REFERENCES "users"("id");

CREATE INDEX "refunds_payment_idx" ON "refunds" ("payment_id");
CREATE INDEX "refunds_credit_note_idx" ON "refunds" ("credit_note_id");
