# Accounting ledger — phased design

**Status:** draft for review · **Owner:** finance work-stream · **Last updated:** 2026-10-03

This document plans how we add a **true double-entry ledger** on top of the
existing billing surfaces (`invoices`, `credit_notes`, `payments`, `receipts`,
`placements.fees`, `service_engagements`) without replacing them. The ledger
runs in **shadow-record mode** first: every finance event the operational
system already emits also lands in the ledger as a balanced journal. No UI
breaks, no customer-visible changes, no data migration until we choose to.

The MASTER SPECIFICATION this is derived from describes an enterprise-grade
accounting platform. This document scopes what is actually buildable by a
3-person MVP team in realistic increments. Items the master spec defines
but we are deferring are listed under **Out of scope (deferred)** in each
phase.

---

## 1. Why we're doing this

| Driver | Current pain | Ledger fix |
|---|---|---|
| Audit-grade correctness | Finance totals are recomputed from ad-hoc SQL on each dashboard; no way to prove `Debits = Credits` at any point in time. | Immutable journal table where every posted row sums to zero. |
| Regulatory ask | Irish/EU VAT returns, revenue reconciliation, and future auditor requests cannot be answered from the current tables without manual spreadsheet work. | Chart of accounts + period close + VAT subledger produce reports in one SQL. |
| Multi-currency | We bill in EUR and ZAR but have no FX-at-posting record, no revaluation, no realised/unrealised FX split. | Journal lines carry `transaction_currency` + `functional_currency` + rate. |
| Business-division visibility | Revenue by `candidate_services` / `recruitment` / `immigration` is reconstructed from joins today. | Every journal line carries a `division_id` dimension natively. |
| Correctness after mistakes | Credit notes work but there's no `REVERSED` journal linking them to the original invoice at the GL level. | Mandatory `reverses_journal_id` on every reversal. |

Scale is **not** on this list. Postgres with the current schema will handle
millions of invoices fine; the ledger exists for correctness and auditability,
not for row throughput.

---

## 2. Core principles

1. **Shadow-record first.** Phase 1–2 add tables and events; they do **not**
   change any existing operational UI, server action, or table. Existing
   invoices, credit notes, payments, and receipts remain the source of truth
   for staff-facing surfaces.
2. **Double-entry is non-negotiable.** Every posted journal has
   `sum(debits) = sum(credits)` enforced by a database `CHECK`. Unbalanced
   journals are rejected at write time.
3. **Immutable after posting.** No `UPDATE` on posted journal rows. Mistakes
   produce a **reversal** journal pointing at the original via
   `reverses_journal_id`.
4. **Idempotent event ingestion.** Every incoming financial event has
   `(source_system, source_event_id)` under a UNIQUE constraint. Replays
   return the existing journal, never a duplicate.
5. **Outbox for reliability.** Operational writes and ledger writes are
   coupled through a transactional outbox: the business change and the event
   row commit together, a background worker drains the outbox into the
   ledger. If the ledger write fails, the event is retried, not lost.
6. **Configurable rules, not hard-coded postings.** Which accounts get hit
   for a given `event_type + service.division + currency` is a
   lookup in `accounting_rules`, not a `switch` in TypeScript.
7. **Decimal precision only.** All money is `numeric(14, 2)` for amounts
   (matches existing `invoices`), with `numeric(18, 8)` for exchange rates.
   Never `float`. Rounding is explicit and stored.

---

## 3. Phase roadmap

Each phase is scoped so it can ship on its own and the system still works if
we stop there. No phase blocks on a future phase.

| Phase | Scope | Rough effort | What ships |
|---|---|---|---|
| **1. Foundation** | Chart of accounts + journals + outbox + idempotency. No events wired yet. | ~2 weeks | Admin can post a manual balanced journal. GL report shows the result. Nothing in operational UI changes. |
| **2. Shadow-record** | Emit `INVOICE_POSTED`, `PAYMENT_RECEIVED`, `CREDIT_NOTE_POSTED`, `PLACEMENT_FEE_RAISED` from existing actions into the outbox. Rule engine turns them into journals. | ~2–3 weeks | Every new finance action lands in the ledger. Historical data stays unmigrated for now (back-fill is a separate ticket). |
| **3. Dashboard reads from ledger** | Dashboard revenue/aging switch from ad-hoc SQL to GL queries. Both systems reconcile daily; drift surfaces in an admin dashboard. | ~1–2 weeks | Reports are consistent across pages. First real benefit for ops. |
| **4. Period close + audit log** | Monthly period lock, trial balance, reversal workflow for closed periods. | ~2 weeks | Finance can close a month. Auditor can trace any number end-to-end. |
| **5. VAT subledger + tax reports** | Dedicated `tax_transactions` subledger, VAT return export (ROS format), reverse-charge handling. | ~2 weeks | VAT filing produced from the ledger, not from spreadsheets. |
| **6. FX revaluation + multi-currency reports** | Daily rate table, period-end revaluation journal, realised/unrealised FX split. | ~1–2 weeks | Multi-currency P&L actually works. |
| **7+. Deferred** | Fixed assets, prepayments, accruals, intercompany, bank-feed import, OCR, approvals, commission payable workflows, AP side of the ledger (we currently only have AR / revenue). | TBD | Each one is a self-contained phase, prioritised against business pain. |

Nothing in Phase 7+ is in-scope for the current build. They're listed so the
Phase 1–2 schema accommodates them (e.g. `journal_lines.supplier_id` is a
nullable column from day one even though no AP flow uses it yet).

---

## 4. Phase 1 data model

Seven new tables. Zero changes to existing tables.

### `accounting_periods`

```
id uuid pk
year int
month int                    -- 1..12
status text                  -- OPEN | SOFT_CLOSED | CLOSED | LOCKED
opened_at, closed_at, locked_at  timestamptz
unique (year, month)
```

Periods are created lazily on first journal post for that month.

### `chart_of_accounts`

```
id uuid pk
code varchar(10) unique      -- "1100", "4100", etc.
name text
type text                    -- ASSET | LIABILITY | EQUITY | REVENUE | COST_OF_SALES | EXPENSE | OTHER_INCOME | OTHER_EXPENSE
parent_account_id uuid null  -- self-FK for hierarchy
currency_code char(3) null   -- null = any currency; e.g. bank accounts pin to one
tax_category text null
active bool default true
allow_posting bool default true  -- parents are typically false
```

Seed data (Phase 1 includes a seed script):

```
1000 Cash                              ASSET
1010 Bank Accounts                     ASSET
1100 Accounts Receivable               ASSET
2100 VAT Payable                       LIABILITY
2300 Deferred Revenue                  LIABILITY
2400 Customer Deposits                 LIABILITY
3000 Share Capital                     EQUITY
3100 Retained Earnings                 EQUITY
3200 Current Year P&L                  EQUITY
4100 Candidate Services Revenue        REVENUE
4200 Recruitment Revenue               REVENUE
4300 Immigration Revenue               REVENUE
7100 Payment Processing Fees           EXPENSE
7400 Foreign Exchange Loss             EXPENSE
```

### `business_divisions`

```
id uuid pk
code text unique             -- 'candidate_services' | 'recruitment' | 'immigration' | 'main'
name text
```

Mirrors the existing `BUSINESSES` constant in `src/lib/auth/permissions.ts`.
Seeded, not managed by UI in Phase 1.

### `financial_events` (idempotency + outbox)

```
id uuid pk
event_type text              -- INVOICE_POSTED, PAYMENT_RECEIVED, etc.
source_system text           -- 'ireland_careers' for in-app events
source_module text           -- 'billing' | 'commerce' | 'recruitment'
source_entity text           -- 'invoice' | 'payment' | 'credit_note' | 'placement'
source_id text               -- the entity's own id, as text
source_event_id text         -- caller-supplied idempotency key, often invoice.id
event_date date              -- business date (not received_at)
received_at timestamptz default now()
processed_at timestamptz null
journal_id uuid null         -- back-ref once posted
status text default 'RECEIVED'  -- RECEIVED | PROCESSING | PROCESSED | FAILED | MANUAL_REVIEW
attempt_count int default 0
last_error text null
payload jsonb                -- original event body, verbatim
unique (source_system, source_event_id)
```

**This is the outbox.** Operational code writes a row here *inside the same
transaction* as the business change (invoice insert, payment verify, etc.).
A background worker drains unprocessed rows into journals. If posting
fails, the row stays with `FAILED` and surfaces in the ops dashboard.

### `journals`

```
id uuid pk
number varchar(24) unique    -- JRN-YYYY-NNNNNN via existing document_sequences pattern
journal_date date
posting_date date
period_id uuid references accounting_periods(id)
transaction_currency char(3) references currencies(code)
functional_currency char(3) default 'EUR'
exchange_rate numeric(18, 8) default 1
description text
source_type text             -- mirrors financial_events.event_type at post time
source_event_id uuid references financial_events(id)
status text default 'DRAFT'  -- DRAFT | PENDING_APPROVAL | POSTED | REVERSED | VOID
created_by_user_id uuid references users(id)
posted_at timestamptz null
reverses_journal_id uuid references journals(id) null
created_at, updated_at timestamptz
check (status in ('DRAFT','PENDING_APPROVAL','POSTED','REVERSED','VOID'))
```

**Posted journals are immutable.** The service layer enforces this; a
Postgres trigger will reject `UPDATE` on any row where `status = 'POSTED'`
except for the status flip to `REVERSED` plus `reverses_journal_id`.

### `journal_lines`

```
id uuid pk
journal_id uuid references journals(id)
line_number int              -- stable ordering within a journal
account_id uuid references chart_of_accounts(id)
division_id uuid references business_divisions(id) null
debit numeric(14, 2) default 0
credit numeric(14, 2) default 0
foreign_debit numeric(14, 2) default 0   -- in transaction_currency when ≠ functional
foreign_credit numeric(14, 2) default 0
currency_code char(3)
customer_person_id uuid references persons(id) null
customer_employer_id uuid references employers(id) null
service_engagement_id uuid references service_engagements(id) null
tax_code text null
description text
check (debit >= 0 and credit >= 0)
check ((debit = 0) <> (credit = 0))   -- exactly one of debit/credit is non-zero
```

Plus a **deferred constraint** at insert time:

```sql
CREATE CONSTRAINT TRIGGER journal_balance_check
  AFTER INSERT OR UPDATE ON journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION assert_journal_balanced();
```

The trigger function sums debits and credits for the parent journal and
rejects commit if they differ. Deferring until commit lets us insert all
lines of a journal in any order within one transaction.

### `accounting_rules`

```
id uuid pk
event_type text
division_code text null      -- null = any division
currency_code char(3) null   -- null = any currency
condition_jsonb jsonb null   -- optional extra matcher
debit_account_code varchar(10)
credit_account_code varchar(10)
line_role text               -- 'PRINCIPAL' | 'TAX' | 'FEE' | 'DISCOUNT'
priority int default 100     -- lower wins
effective_from date
effective_to date null
unique (event_type, division_code, currency_code, line_role, effective_from)
```

Seeded for Phase 2 events; UI to manage comes in Phase 4.

---

## 5. Financial event taxonomy — Phase 2

Only events we **currently** emit (or can emit from existing actions):

| Event | Fires from | Journal shape |
|---|---|---|
| `INVOICE_POSTED` | existing `generateInvoiceAction` | `DR Accounts Receivable / CR Revenue (by division) / CR VAT Payable` |
| `CREDIT_NOTE_POSTED` | existing credit-note issue action | `DR Revenue (by division) / DR VAT Payable / CR Accounts Receivable` |
| `PAYMENT_RECEIVED` | existing `verifyPaymentAction` (on verified payment) | `DR Bank / CR Accounts Receivable` |
| `PLACEMENT_FEE_RAISED` | existing placement-confirm auto-seed | *(no new journal — placement fee becomes an INVOICE_POSTED immediately after)* |

Everything else from the master spec (`BANK_TRANSACTION_IMPORTED`,
`EXPENSE_PAID`, `DEPRECIATION_POSTED`, `ACCRUAL_CREATED`, etc.) is
deferred until the underlying business feature exists.

### Example — invoice for €1,000 immigration service + 23% VAT

Operational action: `generateInvoiceAction` creates an invoice row in the
existing `invoices` table AND inserts into `financial_events`:

```json
{
  "event_type": "INVOICE_POSTED",
  "source_system": "ireland_careers",
  "source_module": "billing",
  "source_entity": "invoice",
  "source_id": "<invoice.id>",
  "source_event_id": "<invoice.id>",
  "event_date": "2026-10-03",
  "payload": {
    "invoice_number": "INV-2026-000042",
    "payer_person_id": "...",
    "service_division": "immigration",
    "subtotal": "1000.00",
    "tax_amount": "230.00",
    "total": "1230.00",
    "currency": "EUR"
  }
}
```

The worker reads matching rules:

```
INVOICE_POSTED / immigration / EUR / PRINCIPAL:
  DR 1100 Accounts Receivable (1000+230)   CR 4300 Immigration Revenue (1000)
INVOICE_POSTED / * / * / TAX:
  (handled by same rule set, splits VAT line)   CR 2100 VAT Payable (230)
```

Resulting journal `JRN-2026-000089`:

```
Line 1  DR 1100 Accounts Receivable        1230.00    division=immigration
Line 2  CR 4300 Immigration Revenue        1000.00    division=immigration
Line 3  CR 2100 VAT Payable                 230.00    division=immigration
```

`sum(debits) = sum(credits) = 1230.00`. The journal row carries
`source_event_id` pointing back to the `financial_events` row, which carries
`source_id` pointing back to the invoice. **Full traceability from GL to
operational system is intrinsic to the data model.**

---

## 6. How events are emitted — the server-action pattern

Existing finance actions get **one extra call** inside their existing
transaction. Nothing else changes. Sketch:

```typescript
// src/modules/billing/generate-actions.ts  (existing file)
export async function generateInvoiceAction(input: GenerateInvoiceInput) {
  return toActionResult(async () => {
    return db.transaction(async (tx) => {
      // ... existing invoice-insert logic unchanged ...
      const [invoice] = await tx.insert(invoices).values({ ... }).returning();

      // NEW: emit financial event in the same tx. If the outer tx rolls
      // back, so does the event — no orphaned ledger entries.
      await emitFinancialEvent(tx, {
        eventType: 'INVOICE_POSTED',
        sourceEntity: 'invoice',
        sourceId: invoice.id,
        sourceEventId: invoice.id,  // invoice id doubles as idempotency key
        eventDate: invoice.issuedAt,
        payload: {
          invoiceNumber: invoice.number,
          serviceDivision: resolveDivision(invoice.serviceEngagementId),
          subtotal: invoice.subtotal,
          taxAmount: invoice.taxAmount,
          total: invoice.totalAmount,
          currency: invoice.currencyCode,
          // ... whatever the rule engine needs
        },
      });

      return { ok: true, data: invoice };
    });
  });
}
```

`emitFinancialEvent` is a one-line helper that inserts a row into
`financial_events`. It's safe to call multiple times with the same
`sourceEventId` — the unique constraint absorbs duplicates with `ON CONFLICT
DO NOTHING`, returning the existing row. **This is where idempotency lives.**

A separate background worker (Phase 1 ships a simple in-process one; later
can move to a dedicated job runner) drains `status='RECEIVED'` rows:

```
loop:
  claim up to N rows with FOR UPDATE SKIP LOCKED, status='RECEIVED'
  for each row:
    try: generate_journal_from_rules(row); mark PROCESSED
    catch retryable: increment attempt_count; keep RECEIVED
    catch fatal:    mark FAILED, surface in dashboard
```

**Journals are posted inside `generate_journal_from_rules`.** That function
is where the double-entry invariant lives and the only place that writes to
`journals` / `journal_lines`.

---

## 7. What the admin UI gets in Phase 1

Minimal — enough to prove the ledger works, not enough to replace anything.

- `/admin/accounting/chart-of-accounts` — list + edit accounts, seed button
- `/admin/accounting/journals` — list of journals with drill-down to lines
- `/admin/accounting/manual-journal` — create a balanced journal by hand
  (restricted to `ADMIN` + `FINANCE`); the primary use is seeding opening
  balances later
- `/admin/accounting/events` — list of `financial_events` with their status;
  manual retry button for `FAILED`

No new tabs on the main dashboard yet. The existing finance surfaces don't
change.

---

## 8. Testing strategy

Non-negotiables for Phase 1:

- **Property-based test** that for 1000 randomly-shaped journals, inserts
  rejected when debits ≠ credits
- **Unit tests** for each accounting rule (invoice/credit-note/payment × 3
  divisions × 2 currencies = 18 scenarios)
- **Integration test** that emits the same event 10× and only one journal
  exists after
- **Integration test** that the outer business tx rolling back also rolls
  back the `financial_events` row (no orphan ledger events)
- **Reconciliation test** — for a seeded fixture, trial-balance totals match
  hand-computed expected values

Playwright coverage comes in Phase 3 (dashboard reads from ledger).

---

## 9. Future cutover — not now, but planned for

Once the ledger has run for ~3 months in shadow mode with a reconciliation
report showing zero drift, we can start moving reads over:

1. Dashboard revenue totals read from `journal_lines` grouped by division
2. AR aging report reads from `chart_of_accounts.code = '1100'` ledger entries
3. Invoice PDF stays rendered from `invoices` (customer-facing numbers must
   match what we issued; the ledger is internal)

Writes stay dual-source for a long time. We don't delete `invoices` /
`payments` / `receipts` tables. They remain the operational system of record
for issuance; the ledger is the system of record for accounting.

Full replacement — if it ever happens — is a Phase 10+ discussion.

---

## 10. Open questions (for the team to decide before Phase 1 build)

1. **Opening balance / historical back-fill?** Phase 2 shadow-records *new*
   events only. Do we back-fill the ledger for all pre-launch invoices, or
   accept that pre-ledger history lives only in the operational tables?
   Recommendation: back-fill a one-shot opening-balance journal per account
   on the Phase 2 launch date, not transaction-by-transaction.
2. **One entity or multi-entity?** The master spec supports multiple legal
   entities (`Company A / B / C`). This app is one Irish entity today. Do we
   add `entity_id` to Phase 1 tables now (cheap) or defer to Phase 7
   (requires migration)? Recommendation: add nullable now, default to the
   single seeded entity, zero cost.
3. **Where does the background worker run?** Options: in the Next.js server
   process via a cron tick, a dedicated Node worker on Vercel's cron, or
   push to an external queue later. For MVP: Vercel cron hitting a
   `/api/cron/drain-financial-events` route every 60s. Simple, cheap, works.
4. **Approval workflow for manual journals in Phase 1?** Nice-to-have but
   not blocking. Recommendation: Phase 4 ships approval; Phase 1 ships
   admin-only post with full audit trail.
5. **Rounding policy on tax splits?** Currently `invoices.tax_amount` is
   stored as computed; we should document whether the ledger inherits the
   stored value (preferred — no re-rounding) or recomputes (risks drift).
   Recommendation: inherit verbatim from the source invoice.

---

## 11. What this document does **not** cover

- UI design beyond the four admin surfaces listed in §7
- SRE / deployment specifics (the ledger lives in the same Postgres as the
  rest of the app; no new infrastructure)
- Pricing / billing changes — this is pure accounting plumbing
- Any master-spec item not referenced above: fixed assets, intercompany,
  commission payable workflows, OCR, bank-feed import, OpenAPI publishing

Those are legitimate future work; they're outside Phase 1–2.
