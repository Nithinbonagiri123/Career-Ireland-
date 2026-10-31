# Finance: follow-up findings for separate approval

Status: **proposal only — nothing in this document is implemented.** Found
during the Finance Stage 6G audit (30 October 2026). The Finance visual
phase (F1–F5) deliberately leaves every item below unchanged. Each item
needs its own decision before any work starts.

The export security fix (S1) is the only Finance behaviour change made so
far; it is described at the end for reference.

---

## 1. Year-end close: the audit note is not saved

- **Today:** the Year-end close dialog asks for a "Note (audited)" and says
  it is written to the audit log. The note is discarded:
  `year-end-close-button.tsx:29` calls
  `postYearEndCloseAction({ year })`, and the action only accepts `{ year }`
  (`src/modules/accounting/year-end-actions.ts:7`). The close itself is
  audited, without the note.
- **Also:** the confirm button uses normal (not destructive) styling, and
  there is no typed confirmation (e.g. typing "FY 2026") for an action that
  cannot be undone.
- **Proposed:** pass the note through the action into the year-end audit
  event (no schema change — audit `context` is JSON); require a minimum
  length like other reasons (≥ 3 characters); add a typed confirmation.

## 2. "Mark verified" checkbox does not control verification

- **Today:** for a user with finance VERIFY authority (ADMIN, FINANCE, or an
  owner on an internal role), `recordPayment` verifies the payment in the
  same call regardless of the checkbox (`src/modules/commerce/service.ts:596`;
  checkbox at `record-invoice-payment-dialog.tsx:196`). The same applies to
  pro-forma payments (`src/modules/proformas/payments.ts:168`). Pages that
  pass `canVerify={false}` (Immigration case, Requisition) hide the checkbox
  but a finance user's recorded payment is still verified instantly.
- **Copy that contradicts it:** "stays PENDING until Finance verifies"
  (pro-forma record dialog), "An ADMIN or FINANCE role will verify" and
  "an ADMIN can then verify" (record dialogs) next to a success toast that
  says "recorded and verified".
- **Proposed (decision needed):** add a `verifyNow` flag that defaults to
  false and is honoured by the server, so the checkbox means what it says;
  then align the copy. The owner has decided **not** to require a different
  person to verify for now; storing who recorded a payment would need a
  schema change and is out of scope until requested.

## 3. Payment status pills show the wrong colour

- **Today:** on the candidate invoice page, Payments tab, every payment gets
  a green pill whatever its status
  (`invoice-detail-tabs.tsx:129`, `tone="green"`), so a rejected or
  refunded payment looks like a successful one. The pro-forma page shows
  raw status codes (e.g. `PROOF_UPLOADED`).
- **Proposed:** use the shared finance status map from F1
  (`src/components/ds/finance-status`) so each status has its own label and
  tone. Visual only, but it changes what finance users read as a payment's
  state, so it is held for approval as requested.

## 4. Accounting: page permissions and server checks disagree

- **Today:**
  - Every accounting page requires `main.accounting.view`.
  - Posting / reversing journals and changing periods check the **role**
    only (ADMIN or FINANCE): `src/modules/accounting/journals.ts:54, :193`,
    `periods.ts:182`. The FINANCE preset does not include
    `main.accounting` (`src/lib/auth/permissions.ts:215`), so a FINANCE user
    cannot open the ledger by default but can post to it by calling the
    action.
  - MANAGER (view/create/edit everywhere) can view the whole ledger and
    create/edit suppliers (`src/modules/ap/service.ts:61, :99`).
  - Period LOCK / reopen use `role !== 'ADMIN'` (`periods.ts:204, :210`),
    ignoring the owner rule.
  - Ledger, report and AP read functions have no service-level check (the
    page is the only gate).
  - Controls (Post journal, Reverse, Transition, Close FY, New bill, Record
    payment, Add/Edit supplier) are shown to every viewer and fail on the
    server for most of them.
- **Proposed (decision needed):** decide whether FINANCE should get
  `main.accounting.view` (a grant change), then make every accounting action
  require permission **and** the existing role/finance policy; add read
  checks to the services; compute button visibility from the same rule.

## 5. Invoice legal wording and registration details

- **Today:**
  - Live invoices print "[RBN — TBC]" and "[VAT — not yet registered]".
    These are **seeded settings values** (migration 0026) editable in Admin
    → Settings; filling them in is an owner data-entry task, not code.
  - The "Invoice footer" setting is editable but never rendered on invoices
    (only on pro formas).
  - The pro forma always prints "… is not currently VAT-registered",
    whatever `settings.vatRegistered` says.
  - Invoices print **today's** VAT rate label, because the invoice row does
    not store its rate (`billing.ts:74-77`); historical invoices would change
    if the rate changed.
  - Titles, row labels, "Thank you for your support.", the
    "Please quote the Invoice Number…" line and the VAT-treatment legal notes
    are hard-coded, against the rule that printable text is editable from
    Admin. "Payment Due" is date-only.
- **Proposed (decision needed, legal):** render the invoice footer; make the
  VAT-registered line follow the setting; move fixed labels and legal notes
  into settings (schema change); store the VAT rate per invoice (schema
  change, affects historical documents); full timestamp for "Payment Due".

## 6. Other findings held for later

- Employer invoices have no Void control (candidate invoices do).
- Any internal user can record a payment against any engagement
  (`commerce/service.ts:535`) and accepting a lead issues an invoice for any
  internal user (documented K1 exception).
- Payment data functions (`fetchPaymentsWorkspace`, `fetchPayments`,
  `fetchEngagements`) and the aging report only check "internal staff" and
  are not scoped by business; the /payments page gate is their only guard.
- Dashboards send every business's revenue to the browser and filter it
  there (Recruitment and Immigration dashboards); the main dashboard finance
  cards need only `main.overview.view`.
- Invoice and receipt detail pages check the payer only, not business or
  module permission; invoices can be linked to a case / requisition /
  placement that does not belong to the payer (issue authority required).
- UI flags use hard-coded role checks (`role === 'ADMIN'`) instead of the
  finance policy, so FINANCE users and owners are sometimes hidden from
  buttons they may use, and others see buttons that fail.
- "Received on" inputs are date-only (changing them changes the payload).
- The Periods page's "Journals" and "Posted" counts always show 0, before and
  after the redesign. `listPeriods` (`src/modules/accounting/periods.ts`)
  appears to compare unqualified columns in its count subqueries (not yet
  confirmed against the generated SQL). Display-only today, but the counts
  are wrong; a fix is a service change.

---

## Reference: S1 export security (implemented, awaiting acceptance)

`/api/export/payments`, `/api/export/revenue-services` and
`/api/reports/revenue` now require the same grants as the /payments page —
`candidate_services.payments.view` **or** `main.accounts.view` (owner
bypasses) — via `src/lib/auth/finance-read.ts`. Unauthorised internal users
get a plain 403 with no data (the denial is audited); unauthenticated
requests are redirected to /login by the proxy. CSV columns, data and the
export audit event are unchanged. The revenue CSV buttons on Reports and the
main dashboard are hidden from users who would be refused. No grants were
added.
