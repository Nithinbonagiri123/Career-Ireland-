# Stage 3 — Multi-line official invoices (migration design)

**Status:** Design only. Not implemented in Stage 2. Below is the exact migration + writer strategy approved for Stage 3 kick-off.

## Current state

`invoices` is a single-line table:

```
invoices (
  id, number, payer_person_id, payer_employer_id, service_engagement_id,
  qty INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(14,2) NOT NULL,
  subtotal NUMERIC(14,2) NOT NULL,
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(14,2) NOT NULL,
  currency_code CHAR(3) NOT NULL,
  line_description TEXT NOT NULL,
  ...
)

CHECK invoices_subtotal_matches_qty_times_unit_price (subtotal = qty * unit_price)
CHECK invoices_totals_add_up                         (total_amount = subtotal + tax_amount)
```

Every invoice today is one line. The Stage 2 accepted pro formas may contain **multiple** service lines. Stage 3 must reproduce those lines verbatim on the official invoice.

## Design

Add a child table mirroring `pro_forma_line_items`, backfill existing rows, loosen the "subtotal = qty × unit_price" tripwire, and keep legacy columns live for one more stage so downstream readers (printable, aging report, ledger) can migrate in a follow-up.

### Target schema

```sql
CREATE TABLE invoice_line_items (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id               uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  service_catalog_item_id  uuid NOT NULL REFERENCES service_catalog_items(id),
  description              text NOT NULL,
  quantity                 numeric(10,3) NOT NULL,
  unit_price               numeric(14,2) NOT NULL,
  line_subtotal            numeric(14,2) NOT NULL,
  sort_order               integer NOT NULL DEFAULT 0,
  created_at               timestamp with time zone NOT NULL DEFAULT NOW(),
  updated_at               timestamp with time zone NOT NULL DEFAULT NOW(),
  CONSTRAINT invoice_line_items_quantity_pos      CHECK (quantity > 0),
  CONSTRAINT invoice_line_items_unit_price_nonneg CHECK (unit_price >= 0),
  CONSTRAINT invoice_line_items_subtotal_nonneg   CHECK (line_subtotal >= 0)
);

CREATE INDEX invoice_line_items_invoice_idx ON invoice_line_items(invoice_id);
CREATE INDEX invoice_line_items_service_idx ON invoice_line_items(service_catalog_item_id);
```

### Migration SQL (exact — ready to drop into migrations/0053)

```sql
-- 1. Create the child table.
CREATE TABLE "invoice_line_items" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "invoice_id" uuid NOT NULL,
    "service_catalog_item_id" uuid NOT NULL,
    "description" text NOT NULL,
    "quantity" numeric(10,3) NOT NULL,
    "unit_price" numeric(14,2) NOT NULL,
    "line_subtotal" numeric(14,2) NOT NULL,
    "sort_order" integer NOT NULL DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "invoice_line_items_quantity_pos"       CHECK ("quantity" > 0),
    CONSTRAINT "invoice_line_items_unit_price_nonneg"  CHECK ("unit_price" >= 0),
    CONSTRAINT "invoice_line_items_subtotal_nonneg"    CHECK ("line_subtotal" >= 0)
);
--> statement-breakpoint
ALTER TABLE "invoice_line_items"
    ADD CONSTRAINT "invoice_line_items_invoice_fk"
    FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "invoice_line_items"
    ADD CONSTRAINT "invoice_line_items_service_fk"
    FOREIGN KEY ("service_catalog_item_id") REFERENCES "public"."service_catalog_items"("id");
--> statement-breakpoint
CREATE INDEX "invoice_line_items_invoice_idx" ON "invoice_line_items" USING btree ("invoice_id");
--> statement-breakpoint
CREATE INDEX "invoice_line_items_service_idx" ON "invoice_line_items" USING btree ("service_catalog_item_id");
--> statement-breakpoint

-- 2. Backfill one line per existing invoice. The source of truth for
--    description comes from `invoices.line_description`; the service
--    catalog item is derived by joining on service_engagements → 
--    service_catalog_items. Falls back to a stable "catch-all" service
--    row (TBD seed) if no deterministic FK is available for very old
--    invoices — Stage 3 adds that seed before this migration runs.
INSERT INTO invoice_line_items (
    invoice_id, service_catalog_item_id, description,
    quantity, unit_price, line_subtotal, sort_order
)
SELECT
    i.id,
    COALESCE(sci.id, (SELECT id FROM service_catalog_items WHERE code = 'LEGACY_LINE' LIMIT 1)),
    i.line_description,
    i.qty::numeric(10,3),
    i.unit_price,
    i.subtotal,
    0
FROM invoices i
LEFT JOIN service_engagements se ON se.id = i.service_engagement_id
LEFT JOIN service_catalog_items sci ON sci.id = se.service_catalog_item_id;
--> statement-breakpoint

-- 3. Loosen the per-row CHECK: the subtotal rule now needs to hold
--    across ALL lines, not just qty * unit_price of the legacy row.
--    We DROP the legacy per-row CHECK and add a looser invariant:
--    subtotal must be the sum of line_subtotal across invoice_line_items.
--    Enforcing that invariant in SQL requires a trigger (or a deferred
--    constraint); for Stage 3 we rely on the writer transaction to
--    insert the aggregate inline and audit any drift. The DB-level
--    guard is kept to "subtotal + tax = total" and "subtotal >= 0".
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS "invoices_subtotal_matches_qty_times_unit_price";
--> statement-breakpoint

-- 4. Legacy columns `qty`, `unit_price`, `line_description` remain
--    NOT NULL for backward compatibility with the current printable,
--    the aging report, and the ledger event payload. Stage 4 (later)
--    migrates those readers to the line_items table and drops the
--    columns in a separate migration. No change here.
```

### Writer strategy (Stage 3)

The pro-forma → official invoice issuance path writes **both** the legacy single-line columns AND the full line items table. First line of the pro forma populates the legacy fields; the full set lives in `invoice_line_items`.

```ts
await db.transaction(async (tx) => {
  const pf = await lockProForma(tx, pfId);
  if (pf.status !== 'ACCEPTED') throw new BusinessRuleError(...);

  // Idempotency (Stage 2's pro_forma_official_invoices.purpose+key UNIQUE).
  const existing = await lookupExistingIssuance(tx, pf.id, 'FULL_PAYMENT', 'full');
  if (existing) return existing;

  const pfLines = await readProFormaLineItems(tx, pf.id);
  const [firstLine, ...rest] = pfLines;
  if (!firstLine) throw new BusinessRuleError('PROFORMA_HAS_NO_LINES');

  const subtotalCents = pfLines.reduce((s, l) => s + moneyToCents(l.lineSubtotal), 0);
  const totalAmountCents = subtotalCents; // non-VAT period; VAT branch adds tax

  const number = await allocateNextNumber(tx, 'INV', year);
  const [invoice] = await tx.insert(invoices).values({
    number,
    payerPersonId: pf.payerPersonId,
    serviceEngagementId: engagementId,
    qty: Math.ceil(Number.parseFloat(firstLine.quantity)), // legacy integer column
    unitPrice: firstLine.unitPrice,
    lineDescription: pfLines.length === 1 ? firstLine.description : `${firstLine.description} + ${rest.length} more`,
    subtotal: centsToMoney(subtotalCents),
    taxAmount: '0.00',
    totalAmount: centsToMoney(totalAmountCents),
    currencyCode: pf.currencyCode,
    vatTreatment: 'OUTSIDE_SCOPE',
    issuedByUserId: session.user.id,
  }).returning();

  // Full line items — the canonical representation going forward.
  await tx.insert(invoiceLineItems).values(
    pfLines.map((l, idx) => ({
      invoiceId: invoice.id,
      serviceCatalogItemId: l.serviceCatalogItemId,
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineSubtotal: l.lineSubtotal,
      sortOrder: idx,
    })),
  );

  // Link + idempotency key.
  await tx.insert(proFormaOfficialInvoices).values({
    proFormaInvoiceId: pf.id,
    invoiceId: invoice.id,
    purpose: 'FULL_PAYMENT',
    issuanceKey: 'full',
    issuedByUserId: session.user.id,
  });

  // Flip pro forma to CONVERTED.
  await tx.update(proFormaInvoices)
    .set({ status: 'CONVERTED' })
    .where(and(eq(proFormaInvoices.id, pf.id), eq(proFormaInvoices.status, 'ACCEPTED')));

  return invoice;
});
```

### Printable update (Stage 3)

`<InvoicePrintable>` currently reads `invoice.qty`, `invoice.unitPrice`, `invoice.lineDescription`. Change it to:

1. Accept an optional `lineItems: InvoiceLineItem[]` prop.
2. If `lineItems` is non-empty, render the full line table (same visual shape as `<ProFormaPrintable>`).
3. Else fall back to the single-line legacy render (keeps historical invoices rendering correctly).

Query change: the invoice detail page passes `lineItems = await fetchInvoiceLineItems(invoice.id)` to the printable. Reader-only — not a schema change.

### Rollback plan

The migration is reversible except for the backfill. To roll back:

```sql
DROP TABLE invoice_line_items;
ALTER TABLE invoices
    ADD CONSTRAINT "invoices_subtotal_matches_qty_times_unit_price"
    CHECK ("subtotal" = "qty" * "unit_price") NOT VALID;
-- Only re-validate once no multi-line writer has run.
ALTER TABLE invoices VALIDATE CONSTRAINT "invoices_subtotal_matches_qty_times_unit_price";
```

If a Stage 3 writer has already produced an invoice whose aggregate subtotal doesn't equal `qty × unit_price` (because the pro forma had multiple lines), the VALIDATE will fail and the rollback is only safe up to the point before the first multi-line issuance. Document in audit the invoice IDs that would be blocked, and reconcile manually.

### Open points

- **Stage 4 cleanup.** Drop legacy columns (`qty`, `unit_price`, `line_description`) and the matching CHECKs after every reader has moved to `invoice_line_items`. Not Stage 3.
- **Credit notes** are still single-line. Multi-line credit notes against multi-line invoices are a separate design (Stage 4).
- **Ledger event payload.** `emitFinancialEvent` currently captures `subtotal + tax + total` on the invoice posted event. Line-item detail does NOT flow to the ledger. Leaving as-is; the ledger stays at document-level granularity.
