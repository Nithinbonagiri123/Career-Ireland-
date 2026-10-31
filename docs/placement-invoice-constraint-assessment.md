# Placement fee pricing and the "one live invoice per placement" index: assessment

**Status: assessment only. Nothing here has been applied.** No schema, migration, index or data change was made.
Assessed 31 Oct 2026, 15:47 (Europe/Dublin, which is UTC+0 on that date). The queries ran against the **local dev/test database**, not production.

---

## Part A: Where the Placement Fee price comes from

### Findings

| Question | Answer | Evidence |
|---|---|---|
| Is there a Placement Fee catalog row? | Yes, exactly one. It is created lazily, not by any seed script. | `src/modules/billing/read.ts:50-74` (`ensurePlacementFeeCatalogItem`, `INSERT … ON CONFLICT (code) DO NOTHING`). It runs from `fetchInvoiceableServicesFor('EMPLOYER')` at `read.ts:85-87`. |
| What does the seed insert? | `code=PLACEMENT_FEE`, `name='Placement Fee'`, `payer_type=EMPLOYER`, `default_currency_code=EUR`. **No `default_price`.** | `read.ts:66-72` |
| Do seed scripts define it? | No. `scripts/seed-services-2026.ts` seeds 4 PERSON services (`INFO_SESSION`, `DIY_CONTACTS`, `CV_COVER_LETTER`, `WORK_PERMIT_APPLICATION`, lines 38-68, all `payerType: 'PERSON'` at line 93). No other seed script mentions placement fees. | grep of `scripts/` |
| Local DB row | `id 22a8de63-20a1-4270-bd15-48acde6471fc`, `PLACEMENT_FEE` / "Placement Fee", `EMPLOYER`, `is_active=true`, **`default_price=NULL`**, `EUR`, `category_id=NULL`, created 10 Oct 2026 12:58:43 (+01). | Read-only query, 31 Oct 2026 15:46 |
| Packages / price tiers | **None.** `service_packages` has 0 rows for this service. | Read-only query |
| Other employer services | `ADS` / "Ads", EMPLOYER, €200.00 default price. Placement Fee is the only one with no price. | Read-only query |
| Schema | `service_catalog_items.default_price numeric(14,2)` is nullable (`src/lib/db/schema/services.ts:53`). `service_packages.price` is NOT NULL (`services.ts:77`). Admins can set `defaultPrice` in `/admin/services` (`src/app/(app)/admin/services/service-item-dialog.tsx:53,120`). | |
| Any fee field on placement, requisition or employer? | No. Placements carry `salary` and `salary_currency_code` (`src/lib/db/schema/recruitment.ts:353-354`). Requisitions carry `salary_min` / `salary_max` (`recruitment.ts:125-127`). There is no fee %, agreed fee or commission column anywhere in `src/lib/db/schema`. | grep `fee|commission|percent` |

### How the invoice dialog prefills the price (`src/components/billing/generate-invoice-dialog.tsx`)

- When the dialog is opened for a placement, it preselects the Placement Fee service: `placementFeeService()` at `:455-460` matches `code === 'PLACEMENT_FEE'` first, then the name `/placement\s*fee/i`. It is used at `:109-112` and re-applied on open at `:135-139`.
- The unit price is prefilled from the catalog's `defaultPrice`, or `''` when there is none (`:117` and `applyService` at `:150`). Currency comes from `defaultCurrencyCode`, defaulting to EUR (`:118`, `:151`).
- If packages exist, the operator can choose one to prefill price and currency (`:156-164`). Every field stays editable.
- The submit button stays disabled until the unit price is a valid decimal (`:170`).
- **Result today:** the Unit price field opens **empty** for a placement fee. Finance has to type the amount by hand.

### What the server does with the price (`src/modules/billing/generate.ts`)

- `generateInvoiceForPayer` is gated by `requireFinanceAuthority('ISSUE', …)` (`:101`), so only finance or admin can call it. There is no separate finance vs non-finance pricing branch.
- `unitPrice` is client-supplied and only format-validated (regex at `:47-49`). The schema comment says: "price + currency below are always the source of truth" (`:41-46`).
- The server never reads `default_price` or the package price to enforce or compare anything. A `servicePackageId` is only checked for belonging to the service and being active (`:202-221`).
- Subtotal = `unitPrice × qty` (`:230`). VAT comes from app settings and the employer's VAT treatment (`:293-311`). That is the only server-side arithmetic.

### Conclusion A

**Placement Fee has no catalog price.** `default_price` is NULL and there are no packages, both in the bootstrap code and in the local DB. The price comes from **the finance user typing it into the Unit price field** at invoice time. An admin *could* set a flat default under Admin → Services, and the dialog would then prefill it, still editable. **Nothing calculates a placement fee automatically.** No code derives a fee from salary or a percentage, and no fee/commission column exists. Placement salary is stored but never used for billing.

---

## Part B: Proposed partial unique index `invoices(placement_id) WHERE status <> 'VOIDED'`

### B1. Existing data (local dev/test DB only)

Read-only results, 31 Oct 2026 15:46:

| Query | Result |
|---|---|
| Total invoices | 506 (ISSUED 169, PAID 335, VOIDED 2, PARTIALLY_PAID 0) |
| Invoices with `placement_id IS NOT NULL` | **0** |
| Placement-linked invoices by status | none |
| Placements with more than 1 invoice (any status) | none |
| Placements with more than 1 non-VOIDED invoice | none |
| `PLACEMENT_SECOND_INVOICE_OVERRIDE` audit rows | 0 |
| Placement-linked invoices with credit notes | none |
| `invoices` table size | 528 kB, 506 rows |

Placement-linked test invoices are created and then cleaned up by `src/modules/leads/conversion-safety.test.ts` and the e2e specs, so the local DB has none left.

**On local data, the index would create successfully.** This says **nothing about production.** The owner must run the read-only pre-check below against production before any migration is drafted.

### B2. Is there a legitimate reason for more than one live invoice per placement?

**How invoices are modelled.** `generateInvoiceForPayer` creates **one engagement + one invoice + one service line** per call (`generate.ts:266-329`). `insertInvoice` writes a single `invoice_line_items` row (`src/modules/billing/service.ts`, around line 184). Multi-line invoices only come from pro forma issuance (`src/modules/proformas/issuance.ts`), and that never sets `placement_id`. **`generate.ts` is the only code that writes `invoices.placement_id`.** No other `insertInvoice` caller passes it: `complimentary.ts`, `direct-payment.ts`, `onboarding-service.ts`, and `leads/service.ts:786` explicitly sets `placementId: null`.

So an extra charge on a placement (expenses, a top-up, the second half of a staged fee) cannot go on the same invoice through this flow. It needs **a second invoice row with the same `placement_id`**.

**The existing W1 guard** is in `generate.ts:524-571` (`resolveInvoiceLinks`):

- It locks the placement row with `SELECT … FOR UPDATE` (`:531-540`). Two concurrent raises for the same placement therefore run one after the other. Under READ COMMITTED, the second one's invoice lookup (`:556-560`, `status <> 'VOIDED'`) sees the first one's committed row. **The guard is race-safe for every writer that goes through this function.**
- If a non-void invoice exists and `overridePlacementInvoiceReason` is shorter than 3 characters, it throws `PLACEMENT_ALREADY_INVOICED` (`:561-568`).
- With a reason, it proceeds and audits `PLACEMENT_SECOND_INVOICE_OVERRIDE` on the existing invoice, recording the reason and the new invoice number (`:330-343`). It also records `placementSecondInvoiceReason` in the new invoice's ISSUED audit context (`:375-377`).
- The dialog shows the reason box when it receives that error code (`generate-invoice-dialog.tsx:208-211`, `:127-129`). The UI already hides "Raise fee" once a live invoice exists (`src/modules/placements/fee.ts`, `isPlacementFeeRaisable`). In practice the override is reached from a stale page or a deliberate retry.

**Real business cases that need a second live invoice:**

1. **Top-up or adjustment after the first fee.** This is the exact scenario `conversion-safety.test.ts:685-705` encodes: a second invoice for "Agreed top-up after salary review".
2. **Staged fees**, e.g. 50% on signing and 50% on start. The flow has no multi-line or instalment model, so this needs two invoices.
3. **Separately invoiced expenses** (advertising, travel) tied to the same placement.
4. **Correcting an invoice that has money on it.** See B3. This is the most important case.

**Would a hard unique index break the finance override? Yes.** With `UNIQUE (placement_id) WHERE status <> 'VOIDED'`, the overridden insert would fail with a 23505 unique violation. That turns an authorised, audited finance action into a 500 or a generic error. `conversion-safety.test.ts:686` would start failing.

### B3. Voided and reissued invoices, credit notes, refunds

- **Statuses:** `ISSUED | PARTIALLY_PAID | PAID | VOIDED` (`src/lib/db/schema/billing.ts:116`).
- **Void** (`voidInvoice`, `billing/service.ts:439-545`) sets `status='VOIDED'` on the existing row and cancels the engagement. It is **refused for PAID** invoices (`:465-470`) and for **any invoice with verified payments** (`:478-492`: "Issue a credit note … instead").
- **Reissue after void** creates a **new invoice row**, a fresh number and a new engagement via `generateInvoiceForPayer`. The old row stays VOIDED. **The `WHERE status <> 'VOIDED'` predicate allows this.** It matches the existing precedent `invoices_engagement_live_uq` (`billing.ts:163-171`, migration `0060_goofy_the_professor.sql`), which exempts VOIDED rows "so the void-and-reissue correction path keeps working".
- **Credit notes** are a separate table (`credit_notes`, `billing.ts:302-335`). Crediting **does not void** the invoice. `recomputeInvoiceStatus` treats credited money as settled: `paid + credited ≥ total → PAID` (`service.ts:351-357`). A **fully credited invoice ends up PAID, not VOIDED.** The local DB confirms it: the only invoice with credit notes has status PAID.
- **Refunds** (`refunds` table, `billing.ts:358-387`) change the *payment's* status (PARTIALLY_REFUNDED / REFUNDED). They never set the invoice to VOIDED.

**Consequence:** take a placement invoice that has a verified payment and was wrong (wrong amount, wrong employer entity). It cannot be voided. The only compliant correction is credit note (plus refund if needed), then reissue. After a full credit the original row is **PAID, so still "live" to the index**, and **the index would block the reissue** permanently. The service guard handles this case today via the audited override. The index cannot, because "fully credited" is an aggregate over another table and cannot be expressed in a partial-index predicate.

### B4. Partial payments

- `PARTIALLY_PAID` is derived from verified payments plus credits (`service.ts:285-370`). The outstanding balance stays on **the same invoice**. Further payments are recorded against it until it flips to PAID, and `assertNoOverpayment` (`service.ts:409-430`) caps payments.
- There is **no reason to issue a second invoice for a balance**. Doing so would double-bill, and the guard plus the duplicate detector (`generate.ts:233-265`, which matches ISSUED/PARTIALLY_PAID on the same payer and service) both push back on it. This is the one area where the index would be harmless. It does not justify the index on its own.

### B5. Migration and rollback risks

- **How migrations run here:**
  - Local and CI: `pnpm db:migrate`, which calls `src/lib/db/migrate.ts`, which calls the drizzle `migrate()`. drizzle runs **all pending migrations inside one transaction** (`node_modules/drizzle-orm/pg-core/dialect.js`, `migrate()` → `session.transaction`).
  - CI also regenerates migrations and fails on drift (`.github/workflows/ci.yml:130-136`).
  - Production: `.github/workflows/deploy.yml` is **manual and owner-only**, with the kill switch `PROD_MIGRATIONS_ENABLED` unset by default (`deploy.yml:3-34, 82-90`). It requires a plan, a digest, and an apply with `reviewed_digest`, then runs `scripts/ci/apply-migrations.sh`, which uses `psql -f` per file (no single transaction).
- **CONCURRENTLY vs a plain index:**
  - `CREATE UNIQUE INDEX CONCURRENTLY` cannot run inside a transaction block. It would **fail under `pnpm db:migrate`** in CI and locally, even though prod psql would accept it. So it is not usable unless the migration tooling changes, and that tooling is out of scope.
  - A plain `CREATE UNIQUE INDEX` takes a SHARE lock on `invoices`, which blocks inserts, updates and deletes while the index builds. At about 500 rows / 528 kB locally (production is likely a similar order), that is milliseconds.
  - The precedent `0060` used a plain create. Low risk, but run it outside business hours.
- **If duplicates exist:** the creation fails with `could not create unique index … Key (placement_id)=(…) is duplicated`. Under drizzle the whole migration batch rolls back. Under prod psql, the failing file aborts with ON_ERROR_STOP and is not recorded in `__ic_migrations`. Earlier files in the same run stay applied. **Always run the pre-check first.**
- **Rollback:** `DROP INDEX IF EXISTS invoices_placement_live_uq;` loses no data. Remove the drizzle `uniqueIndex` line and generate a follow-up migration so CI's drift check stays green.
- **Drizzle schema change:** one `uniqueIndex(...).on(t.placementId).where(sql\`…\`)` entry in the `invoices` table extras in `src/lib/db/schema/billing.ts`, next to `invoices_engagement_live_uq`, plus a generated `0062_*.sql` and snapshot.
- **Tests affected by a plain index:**
  - `src/modules/leads/conversion-safety.test.ts:685-705` issues a second live invoice on one placement via the override and **would fail**.
  - No e2e spec creates two invoices on one placement. Checked: `e2e/rec-p0-fin.spec.ts` and `e2e/rec-p0-place.spec.ts` raise one fee each, and `e2e/stage-b-wave1.spec.ts` overrides the payer+service duplicate check, not placements. `e2e/full-flow.spec.ts` raises one fee.

### Recommendation: **don't adopt the plain index. Keep the service-level guard.** Adopt a DB constraint only with conditions, as a separate, owner-approved schema change.

Why:

1. The plain index **hard-blocks two legitimate, finance-authorised paths**: the audited override (top-up, staged fee, expenses) and **reissue after a full credit note**. Credit-then-reissue is the *only* compliant correction once money has been received.
2. The service guard is already **race-safe** (placement row `FOR UPDATE`), and **`generate.ts` is the only writer of `placement_id`.** The index would add protection only against future writers that bypass `generateInvoiceForPayer`, and code review or a unit test can cover that.
3. If the owner still wants a DB-level guarantee, it **needs a new column** so overrides and reissues can be marked and exempted. That is a schema change and is outside the current P0 restrictions.

#### Option kept for later (NOT APPLIED): marker column + partial unique index

`invoices.placement_override_reason text NULL`. `generate.ts` would set it from `links.placementOverride.reason`. The index only constrains the *first, unmarked* live invoice per placement:

```sql
-- NOT APPLIED. Proposed migration 0062_placement_live_invoice_uq.sql
ALTER TABLE "invoices" ADD COLUMN "placement_override_reason" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_placement_live_uq"
  ON "invoices" USING btree ("placement_id")
  WHERE placement_id IS NOT NULL
    AND status <> 'VOIDED'
    AND placement_override_reason IS NULL;
```

```ts
// NOT APPLIED. src/lib/db/schema/billing.ts, invoices columns:
placementOverrideReason: text('placement_override_reason'),
// …and in the table extras, beside invoices_engagement_live_uq:
uniqueIndex('invoices_placement_live_uq')
  .on(t.placementId)
  .where(sql`placement_id IS NOT NULL AND status != 'VOIDED' AND placement_override_reason IS NULL`),
```

Required code change (NOT APPLIED): in `generate.ts`, pass `placementOverrideReason: links.placementOverride?.reason ?? null` through `insertInvoice` (`billing/service.ts:71`). Also map a 23505 on `invoices_placement_live_uq` to `PLACEMENT_ALREADY_INVOICED`, so the dialog shows the reason box instead of a generic error.

With this design, the override and credit-then-reissue both keep working (finance enters a reason). An *unmarked* second live invoice is impossible at the DB level.

If the owner prefers the **plain index with no column** anyway (accepting that overrides and credit-reissue are blocked), it is:

```sql
-- NOT APPLIED. Plain variant (blocks the finance override and reissue-after-full-credit)
CREATE UNIQUE INDEX "invoices_placement_live_uq"
  ON "invoices" USING btree ("placement_id")
  WHERE status <> 'VOIDED';
```

```ts
// NOT APPLIED
uniqueIndex('invoices_placement_live_uq').on(t.placementId).where(sql`status != 'VOIDED'`),
```

That variant would also require removing the override branch in `generate.ts:561-570` and the override UI, and rewriting `conversion-safety.test.ts:685-705`.

#### Production pre-check (read-only; the owner runs it against production)

```sql
BEGIN READ ONLY;
-- 1. Placements that would violate the plain index
SELECT placement_id, count(*) AS live_count,
       string_agg(number || ':' || status || ':' || total_amount || ' ' || currency_code,
                  ', ' ORDER BY created_at) AS invoices
FROM invoices
WHERE placement_id IS NOT NULL AND status <> 'VOIDED'
GROUP BY placement_id
HAVING count(*) > 1
ORDER BY live_count DESC;
-- 2. Context: every placement-linked invoice by status
SELECT status, count(*) FROM invoices WHERE placement_id IS NOT NULL GROUP BY status;
-- 3. Overrides already used in production
SELECT count(*) FROM audit_events
WHERE entity_type = 'invoice' AND action = 'PLACEMENT_SECOND_INVOICE_OVERRIDE';
ROLLBACK;
```

If query 1 returns any rows, the plain index will fail to build. Those rows are also the real-world evidence of legitimate second invoices.

#### Rollback (NOT APPLIED)

```sql
DROP INDEX IF EXISTS "invoices_placement_live_uq";
-- marker-column variant only, after the code stops writing it:
-- ALTER TABLE "invoices" DROP COLUMN IF EXISTS "placement_override_reason";
```

Then remove the drizzle definitions and run `pnpm db:generate` so the CI drift check passes.
