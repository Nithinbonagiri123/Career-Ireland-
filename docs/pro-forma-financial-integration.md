# Pro Forma → Payments → Official Invoice — financial integration design

**Status:** Design only. No activation in Stage 2. Stage 3 implements the writer paths described below.

## Scope

This document specifies how the existing payment, receipt, credit note, and refund architecture will interact with the Stage 2 pro-forma workflow. It covers:

1. Multiple partial payments against one accepted pro forma.
2. How verified receipts avoid duplication.
3. Payment allocation tracing.
4. Outstanding balance computation.
5. Currency-mismatch handling.
6. Refunds and reversals.
7. Default rule for official invoice generation while the business is non-VAT-registered.
8. Idempotency for official invoice issuance.
9. Line-item parity between accepted pro forma and issued official invoice(s).

The design preserves two load-bearing invariants from the existing codebase:

- `invoices` (official) are immutable and sequentially numbered via `document_sequences(prefix='INV')`.
- `receipts` are issued one-per-settled-payment via `receipts.payment_id UNIQUE`.

Nothing in this document changes those invariants.

---

## 1. Partial payments against one accepted pro forma

**Model.** A new column `payments.pro_forma_invoice_id uuid NULL` was added in Stage 1 and is already indexed. Payments created *before* official invoice issuance may reference a pro forma instead of an invoice; `payments.invoice_id` remains nullable while the pro forma hasn't yet become an invoice.

**Lifecycle timeline:**

```
Pro forma ISSUED → ACCEPTED
                      │
                      ├── payment 1 (deposit)                [pro_forma_invoice_id set]
                      ├── payment 2 (second instalment)      [pro_forma_invoice_id set]
                      ├── ...
                      └── payment N (final)                  [pro_forma_invoice_id set]
                      │
                      ↓
             Fully paid → official invoice issuance (Stage 3)
                      │
                      └── invoice row inserted;
                          each payment is UPDATEd with invoice_id = new id
                          each payment's existing receipt row stays attached
                          `pro_forma_invoice_id` is retained on each payment for traceability
```

**Allowed payment states against a pro forma:**

- Pending (unverified) — operator entered what the client said they paid.
- Verified — Finance confirmed the bank line matches. Writes a receipt per the existing receipts path.
- Rejected — Finance marked the payment invalid (wrong amount, wrong account, duplicate).

Verification writes a `receipts` row keyed by `payment_id` — this is already in place and does not change.

## 2. Verified receipts never duplicated

Already guaranteed by `UNIQUE(receipts.payment_id)`. The Stage 3 verify path is identical to today's; the only change is that `receipts.invoice_id` is nullable while the pro forma is still unconverted. On conversion to an official invoice we backfill `receipts.invoice_id` for each receipt pointing at a payment whose `pro_forma_invoice_id` matches the pro forma being issued.

## 3. Payment allocation traceability

Every payment carries both:

- `pro_forma_invoice_id` — the agreement it settles against (ISSUED pre-conversion, retained after conversion for audit)
- `invoice_id` — populated when the official invoice exists

The pairs `(pro_forma_invoice_id, invoice_id)` give full traceability from either direction. The audit log captures `PAYMENT_ALLOCATED` events on every state transition.

## 4. Outstanding balance

The outstanding balance against a pro forma is computed as:

```
outstanding_cents = (
  pro_forma_invoices.subtotal_cents
  - SUM(verified payments.amount_cents for the pro forma, converted to pro forma currency)
  + SUM(refunds.amount_cents against those payments)
  + SUM(credit_notes.amount_cents against the resulting invoice, if any)
)
```

For Stage 3 we expose this as a read-only view / helper `fetchProFormaBalance(proFormaId)` returning `{ paid, outstanding, overpaid, byCurrency }`. The caller is responsible for currency conversion when payments exist in a different currency than the pro forma (see §5).

## 5. Currency mismatch handling

**Rule.** A payment's `currency_code` must equal the pro forma's `currency_code`. The service refuses to attach a mismatched payment with a clear error (`PROFORMA_CURRENCY_MISMATCH`).

**Rationale.** We do not hold FX rates and do not want pro forma balances drifting with the market. Clients paying in a different currency must either (a) convert externally and pay in the pro forma currency, or (b) ask for a new pro forma issued in their preferred currency (Stage 2 already supports this — amend workflow in Stage 3).

The error surface is intentionally sharp so Finance notices before the receipt is cut.

## 6. Refunds and reversals

Refunds today reference `payment_id`, not `invoice_id`. They continue to do so. On a pro-forma-stage refund:

- The payment is marked `REFUNDED` with a `refunds` row referencing it.
- `pro_forma_invoice_id` on the payment is retained for audit.
- Outstanding balance recomputes to include the refund (see §4).
- Audit log records `PAYMENT_REFUNDED` with `{ proFormaInvoiceId, refundReason }` context.

If the pro forma has already been issued as an official invoice, the refund path is the current invoice refund path (credit note + optional refund); the pro-forma coupling adds no new rules.

## 7. Non-VAT default for official invoice generation

While `app_settings.vatRegistered = false` **and** `vatRegistrationEffectiveDate IS NULL OR > now()`:

- Official invoice generation is triggered by **full verified payment** against an accepted pro forma (sum of verified payments ≥ pro forma total, within rounding tolerance of 1 cent).
- The resulting invoice is `vatTreatment = 'OUTSIDE_SCOPE'` with `taxAmount = '0.00'`.
- The invoice total equals the pro forma subtotal (no VAT added).
- `pro_forma_official_invoices.purpose = 'FULL_PAYMENT'`, `issuance_key = 'full'`.

Once the business becomes VAT-registered (future), the above defaults change — invoice issuance may be triggered earlier (on acceptance or deposit) depending on advisor guidance, and VAT lines are added per standard rate. This is explicitly out of scope for Stage 3.

## 8. Idempotency

**Service pattern** (Stage 3, inside a transaction):

```ts
await db.transaction(async (tx) => {
  // 1. Lock the pro forma row so a concurrent verify path can't double-issue.
  const [pf] = await tx
    .select()
    .from(proFormaInvoices)
    .where(eq(proFormaInvoices.id, pfId))
    .for('update')
    .limit(1);
  if (!pf) throw new NotFoundError('Pro forma');
  if (pf.status !== 'ACCEPTED') throw new BusinessRuleError('PROFORMA_NOT_ACCEPTED');

  // 2. Idempotency check — if an invoice has already been issued for
  //    (purpose='FULL_PAYMENT', issuance_key='full'), return it.
  const [existing] = await tx
    .select({ invoiceId: proFormaOfficialInvoices.invoiceId })
    .from(proFormaOfficialInvoices)
    .where(
      and(
        eq(proFormaOfficialInvoices.proFormaInvoiceId, pf.id),
        eq(proFormaOfficialInvoices.purpose, 'FULL_PAYMENT'),
        eq(proFormaOfficialInvoices.issuanceKey, 'full'),
      ),
    )
    .limit(1);
  if (existing) return readInvoice(existing.invoiceId); // idempotent return

  // 3. Fresh issuance — insert the invoice via the existing writer,
  //    then write the join row. The UNIQUE constraint on
  //    (pro_forma_invoice_id, purpose, issuance_key) is the DB-level
  //    backstop against a race.
  const invoice = await insertInvoiceForProForma(tx, { ... });
  await tx.insert(proFormaOfficialInvoices).values({
    proFormaInvoiceId: pf.id,
    invoiceId: invoice.id,
    purpose: 'FULL_PAYMENT',
    issuanceKey: 'full',
    issuedByUserId: session.user.id,
  });

  // 4. Flip the pro forma to CONVERTED.
  await tx.update(proFormaInvoices)
    .set({ status: 'CONVERTED' })
    .where(and(eq(proFormaInvoices.id, pf.id), eq(proFormaInvoices.status, 'ACCEPTED')));

  return invoice;
});
```

Milestone / deposit / balance / amendment issuance all use the same pattern with their own `(purpose, issuanceKey)` tuple. Legally required additional documents (e.g., an amendment invoice adding scope to an accepted pro forma) go through `purpose = 'AMENDMENT'`.

## 9. Line-item parity

**Hard rule.** The official invoice's line items must match the accepted pro forma or a documented amendment. The composer is reused: the Stage 3 issuer reads the pro forma's line items, maps them to invoice line items (today one `line_description` on the invoice; Stage 3 will likely extend the invoice schema to a child `invoice_line_items` table mirroring the pro-forma layout), and copies the quantities + prices verbatim.

Any divergence (operator wants to invoice less than the accepted pro forma) must go through an explicit **amend-pro-forma** workflow — not a one-off invoice edit. This is the single point that keeps the paper trail honest.

## Open decisions (not resolved in Stage 2)

- **Partial-payment invoicing.** Should a partial verified payment trigger an interim receipt-only path (no official invoice yet), or should we also issue a DEPOSIT invoice? Finance advisor decision — leaning toward receipt-only for the non-VAT period, DEPOSIT invoice once VAT-registered.
- **Overpayment handling.** If verified payments exceed the pro forma total, do we auto-flip overflow to a credit on the person's account, or refuse the surplus payment at verify time? Leaning toward credit-on-account.
- **Invoice line items schema.** Current `invoices` has a single-line schema; migrating to multi-line to match pro-forma shape is a separate migration (not Stage 2).

These three decisions block Stage 3 and should be resolved with Finance before implementation starts.
