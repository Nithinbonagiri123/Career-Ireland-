# Stage 3 — Receipt reconciliation + payment allocation (design)

**Status:** Design only. Not implemented in Stage 2. Builds on the four financial decisions approved after the Stage 2 close-out:

1. **Partial payments:** record the payment, verify as today, write the receipt. Issue the official non-VAT invoice **only** on full verified payment (while non-VAT-registered).
2. **Overpayments:** do not silently create credit-on-account. Prevent over-allocation at verify time; route excess funds through an explicit exception workflow.
3. **Official invoice line items:** multi-line, mirroring the accepted pro forma. See [stage3-multi-line-invoices.md](stage3-multi-line-invoices.md).
4. **Currency mismatch:** no silent FX conversion. Require a defined exchange-rate + allocation policy before accepting a mismatched payment.

The design preserves the existing invariants:

- `receipts.payment_id UNIQUE` — exactly one receipt per settled payment
- `invoices` immutable once issued; corrections via credit notes
- `document_sequences` locking for `INV` / `RCT` numbers

Nothing in this document changes those.

## 1. States and transitions

### Payment states (unchanged)

```
PENDING → PROOF_UPLOADED → VERIFIED → (REFUNDED | PARTIALLY_REFUNDED)
                        └→ REJECTED
```

### Pro-forma states that drive issuance

```
ACCEPTED  ──(verified payments sum ≥ pro forma total)──→  CONVERTED
```

The transition is triggered by the Stage 3 reconciliation routine, not by any manual action. The pro forma stays ACCEPTED while partial payments accrue; it flips to CONVERTED atomically with the official invoice being written.

## 2. Reconciliation routine

Runs inside the `verify-payment` transaction. After the operator marks a payment VERIFIED:

```ts
await db.transaction(async (tx) => {
  // 1. Mark the payment VERIFIED. Audit as today.
  const payment = await markVerified(tx, paymentId, { verifiedByUserId, verifiedAt });

  // 2. Issue the receipt (existing path). Guaranteed-unique by payment_id.
  const receipt = await insertReceipt(tx, { paymentId: payment.id, ... });

  // 3. If this payment is pro-forma-attached, run the reconciliation.
  if (payment.proFormaInvoiceId) {
    await reconcileAgainstProForma(tx, payment.proFormaInvoiceId, session.user.id);
  }
});
```

### `reconcileAgainstProForma` outline

```ts
async function reconcileAgainstProForma(tx, pfId, actorUserId) {
  // Lock the pro forma row.
  const [pf] = await tx.select(...)
    .from(proFormaInvoices)
    .where(eq(proFormaInvoices.id, pfId))
    .for('update')
    .limit(1);
  if (!pf || pf.status !== 'ACCEPTED') return;   // already converted or invalid state

  const summary = await summarisePayments(tx, pfId, pf.currencyCode);
  //   summary = {
  //     verifiedSumCents,    // sum of verified payments in the pro-forma currency
  //     mismatchCount,       // how many verified payments were in a different currency
  //     overallocationCents  // (verifiedSumCents - proFormaTotalCents) when > 0
  //   }

  if (summary.mismatchCount > 0) {
    // Decision #4 — refuse auto-issuance when any attached payment is
    // in a different currency. Finance resolves manually.
    await emitEvent(tx, 'PROFORMA_RECON_BLOCKED_CURRENCY_MISMATCH', { pfId });
    return;
  }

  if (summary.overallocationCents > 0) {
    // Decision #2 — no silent credit-on-account. Flag + require explicit
    // operator action (refund the excess, or route via exception workflow).
    await emitEvent(tx, 'PROFORMA_RECON_BLOCKED_OVERALLOCATION', {
      pfId, excessCents: summary.overallocationCents,
    });
    return;
  }

  const pfTotalCents = moneyToCents(pf.subtotal);
  const fullyPaid = summary.verifiedSumCents === pfTotalCents;
  if (!fullyPaid) return;                     // still partially paid — nothing to do

  // Full verified payment hit. Issue the official invoice (idempotent
  // via pro_forma_official_invoices triple-unique).
  await issueOfficialInvoiceForProForma(tx, {
    proFormaInvoiceId: pfId,
    purpose: 'FULL_PAYMENT',
    issuanceKey: 'full',
    issuedByUserId: actorUserId,
  });
  await tx.update(proFormaInvoices)
    .set({ status: 'CONVERTED', updatedAt: new Date() })
    .where(and(eq(proFormaInvoices.id, pfId), eq(proFormaInvoices.status, 'ACCEPTED')));
}
```

## 3. Partial payments

**Rule.** A verified payment less than the outstanding balance leaves the pro forma in ACCEPTED. The payment+receipt is recorded exactly as today. No official invoice yet.

**UI surface.** The lead detail page's "Pro formas" panel shows a per-pro-forma status line:

```
PROF-2026-000042 · ACCEPTED · €2,500.00 of €4,000.00 paid (62%) · €1,500.00 outstanding
```

The outstanding figure uses `summarisePayments` logic. It never auto-advances the pro forma; conversion only happens on full verified payment.

**Edge: multiple partial payments in different currencies.** Blocked. See §6.

## 4. Overpayments

**Rule.** The verify-payment writer refuses to flip a payment to VERIFIED if the resulting verified-sum would exceed the pro forma total by more than a 1-cent rounding tolerance.

**Error:**

```
BusinessRuleError('PAYMENT_WOULD_OVERALLOCATE',
  'Verifying this payment would exceed the accepted pro forma total by €X. Resolve the excess via refund or exception workflow before verifying.')
```

**Exception workflow** (operator path):

1. Operator opens the pending payment.
2. The verify button is disabled; a "Resolve excess" prompt appears.
3. Operator picks one of:
   - **Refund excess to client** — opens the standard refund path for the excess amount only (reduces this payment's net to the exact outstanding). The refund stays pending until the receipt-side bank reversal is confirmed.
   - **Pay excess to secondary line** — only valid if another ACCEPTED pro forma for the same person exists on an engagement with outstanding balance in the same currency; the operator confirms the destination.
   - **Hold on account (exception)** — writes a dedicated `payment_excess` row (new table in Stage 3) that captures amount + reason + decided_by + decided_at. The payment itself is capped to the exact outstanding; the excess sits in `payment_excess` as a known liability. Finance reviews these monthly.

No pathway allows a verified payment to be larger than the outstanding balance.

## 5. Refunds and reversals

Refunds reference `payments.id` (no change). After a refund:

- `payments.status` → `PARTIALLY_REFUNDED` or `REFUNDED`
- The reconciliation routine recomputes verified-sum net of refunds.
- If a refund brings a `CONVERTED` pro forma back below full payment, the pro forma does NOT automatically un-convert. The audit log captures the mismatch and routes to Finance for review. A credit note against the issued invoice is the correct legal action (existing path).

**Rule.** We never silently un-convert a pro forma. Legal invoice reversal is manual (credit note + optional refund), consistent with Stage 2's "accepted agreements cannot be silently edited" invariant.

## 6. Currency mismatch

**Rule.** A payment's `currency_code` must equal the pro forma's `currency_code` to be auto-reconciled. If it doesn't:

- The payment can still be recorded (operator may be entering a bank line as-is).
- Verification refuses: `BusinessRuleError('PAYMENT_CURRENCY_MISMATCH', ...)`.
- Resolution requires an explicit **exchange-rate record** created by Finance (new table in Stage 3, outlined below) tying `(from_currency, to_currency, effective_date)` to a rate. Only then may the verify writer run FX conversion using the pinned rate; the resulting `amount_in_pf_currency` is stored on the payment row for audit.

### `fx_rates` (new Stage 3 table — sketch)

```sql
CREATE TABLE fx_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency char(3) NOT NULL REFERENCES currencies(code),
  to_currency   char(3) NOT NULL REFERENCES currencies(code),
  rate          numeric(18, 8) NOT NULL,
  effective_date date NOT NULL,
  source        text NOT NULL,              -- 'manual_entry' | 'ecb_daily' | ...
  created_by_user_id uuid REFERENCES users(id),
  created_at    timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT fx_rates_rate_pos CHECK (rate > 0),
  CONSTRAINT fx_rates_distinct CHECK (from_currency <> to_currency),
  UNIQUE (from_currency, to_currency, effective_date)
);
```

**Rule for lookup.** When reconciling a payment in currency X against a pro forma in currency Y, the writer looks up the most-recent `fx_rates` row with `(from_currency=X, to_currency=Y, effective_date <= payment.received_at)`. If none exists, reconciliation refuses with `BusinessRuleError('FX_RATE_MISSING', 'No exchange rate for X→Y on or before <date>. Finance must record a rate before verifying.')`.

The pinned rate used for a given payment is captured on `payments.fx_rate_used_id` (new nullable FK). An auditor can reproduce any multi-currency reconciliation deterministically.

## 7. Idempotency

The duplicate-issuance protection in Stage 2's `pro_forma_official_invoices_purpose_unique(pro_forma_invoice_id, purpose, issuance_key)` is the DB-level backstop. The service additionally:

- Takes `FOR UPDATE` on the pro forma row before any read of existing issuance.
- Treats an existing join row for the triple as a **success** — returns the same invoice idempotently.

Concurrent verify-payment calls that both trip the "fully paid" threshold will race; the FOR UPDATE lock serialises them. The second one sees `pf.status = 'CONVERTED'` (set by the first) and returns the already-issued invoice.

## 8. Reader APIs

Stage 3 adds two read helpers used by the UI:

```ts
fetchProFormaBalance(pfId): Promise<{
  pfTotal: string,
  verifiedPaid: string,
  outstanding: string,
  overpaidExcess: string,
  byCurrency: Array<{ currency: string, amount: string }>,
  mismatchCount: number,
}>

fetchProFormaIssuance(pfId): Promise<Array<{
  invoiceId: string,
  invoiceNumber: string,
  purpose: string,
  issuanceKey: string,
  issuedAt: Date,
}>>
```

These are the two sources the "Pro formas" panel reads to render the balance line + the "Official invoice: INV-2026-xxxxxx" link.

## 9. What this adds to the DB (Stage 3 migration summary)

Not a Stage 2 deliverable. Enumerated here so Stage 3 kick-off is unambiguous:

- `invoice_line_items` child table + backfill (see [stage3-multi-line-invoices.md](stage3-multi-line-invoices.md))
- `fx_rates` reference table (see §6)
- `payment_excess` table for the exception workflow (see §4)
- Columns on `payments`:
  - `fx_rate_used_id uuid NULL REFERENCES fx_rates(id)`
  - `allocated_amount numeric(14,2) NULL` — the amount counted toward the pro forma (in the pro forma currency, net of any excess)
- Possibly: a `payment_allocations` table if we end up supporting one-payment-to-multiple-pro-formas. Not committed in Stage 3; design parked.

## 10. What we do NOT do

- No silent FX conversion. Any mismatched currency requires an explicit `fx_rates` row with a human signature.
- No automatic un-conversion of a CONVERTED pro forma on later refund.
- No credit-on-account auto-posting. Overpayments route via explicit exception.
- No ledger changes. Journal continues to feed off `INVOICE_POSTED` + `PAYMENT_VERIFIED` + `CREDIT_NOTE_ISSUED` events as today.
