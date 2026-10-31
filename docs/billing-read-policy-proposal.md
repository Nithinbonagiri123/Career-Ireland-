# Billing-read policy — current state and proposal

> **Status: proposal, not implemented.** Owner instruction: *"Do not assume
> recruitment.employers.view alone authorizes financial record access. Document and propose the
> appropriate billing-read policy. Do not broaden financial access during P0."*
>
> Prepared 2026-10-31 (Europe/Dublin) by workstream W5. Line numbers are as of that date. Other
> P0 workstreams are editing some of these files, so look the functions up by name.

## 1. The permission model in one page

- **Grants** live per user in `user_permissions` as `(business, module, verb)`. Verbs cascade
  (`manage > delete > edit > create > view`). A role only picks the *preset* given when the user is
  created (`presetForRole`, `src/lib/auth/permissions.ts:179`). The owner can change grants later.
- **Owner** (`users.is_owner`) bypasses every `requirePermission` / `checkPermission`
  (`src/lib/auth/session.ts:230,250,265`).
- **`requireInternalStaff()`** (`session.ts:143`) lets in **every** internal role: ADMIN, STAFF,
  MANAGER, RECRUITER, DOCUMENT_SPECIALIST and FINANCE. It ignores grants, so a STAFF user with zero
  grants passes.
- **Finance read** already exists: `src/lib/auth/finance-read.ts`. `requireFinanceRead()`,
  `canReadFinance()` and `financeReadDeniedResponse()` pass on `candidate_services.payments.view`
  **or** `main.accounts.view`, plus the owner. Commit `d0b080d` ("enforce finance permissions on
  revenue exports") introduced it for `/payments` and the payments/revenue CSVs.
- **Finance authority** (`hasFinanceAuthority`, `src/lib/auth/finance-policy-rules.ts:42`) is
  **role-based**: owner, ADMIN or FINANCE may ISSUE, VERIFY or REVERSE. Everyone internal may
  PREPARE.
- **There is no `recruitment.billing` module.** Nothing in the Recruitment permission set says
  "may see money".

### Who holds the relevant grants by default (role presets)

| Grant / check | ADMIN | MANAGER | RECRUITER | FINANCE | STAFF | DOC_SPEC | Owner |
|---|---|---|---|---|---|---|---|
| `requireInternalStaff()` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `recruitment.employers.view` / `.requisitions.view` / `.placements.view` | ✅ | ✅ | ✅ | ✅ (view only) | ❌ | ❌ | ✅ |
| `main.overview.view` (main dashboard, /reports) | ✅ | ✅ | ❌ | ✅ | ❌* | ❌ | ✅ |
| **Finance read** (`cs.payments.view` OR `main.accounts.view`) | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ |
| `candidate_services.engagements.view` | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ |
| `main.accounting.view` (VAT export) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Finance authority (ISSUE / VERIFY / REVERSE) | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |

\* STAFF has nothing by default, but grants are per user. The E2E STAFF user, for example, is
given `main.overview.view` (`e2e/global-setup.ts:181-189`).

## 2. Every surface that reads invoices, receipts, payments, credit notes or fee amounts

"Who can read today" is derived from the presets above. ⚠ marks a mismatch with the owner's rule.

| # | Surface | Data exposed | Page check | Data-loader check | Who can read today | Appropriate? |
|---|---|---|---|---|---|---|
| 1 | **Employer → Billing tab** `/employers/[id]?tab=billing` | All employer invoices and receipts, totals, Invoiced/Received summary | `requireInternalStaff()` (`employers/[id]/page.tsx:112`) | `fetchEmployerBillingHistory` → `requireInternalStaff()` (`billing/read.ts:594`) | **all 6 roles**, including STAFF with no grants and DOC_SPEC | ⚠ No. Not even `employers.view` is checked. |
| 2 | **Employer invoice page** `/employers/[id]/invoices/[number]` | Full invoice, line items, credit notes, payment trail; refundable payments (only for ADMIN/FINANCE) | `requireInternalStaff()` plus a payer-matches-URL check (`invoices/[number]/page.tsx` ~l.40-44) | `fetchInvoiceForPrint` (`read.ts:161`), `fetchCreditNotesForInvoice` (`:266`), `fetchInvoicePaymentTrail` (`:363`), `fetchRefundablePaymentsForInvoice` (`:303`): all `requireInternalStaff()` | all 6 roles | ⚠ No |
| 3 | **Employer receipt page** `/employers/[id]/receipts/[number]` | Receipt: amount, method, payer | `requireInternalStaff()` plus payer check | `fetchReceiptForPrint` (`read.ts:628`) `requireInternalStaff()` | all 6 roles | ⚠ No |
| 4 | **Candidate invoice / receipt pages** `/candidates/[id]/invoices/[number]`, `/receipts/[number]` | Same as 2 and 3 for person payers | `requireInternalStaff()` plus payer check | same loaders | all 6 roles | ⚠ No |
| 5 | **Requisition → Billing tab** `/requisitions/[id]` | Invoices and receipts tied to the job, FinancialSummaryCard | `requireInternalStaff()` (`requisitions/[id]/page.tsx:89`) | `fetchRequisitionBillingHistory` (`read.ts:555`) `requireInternalStaff()` | all 6 roles | ⚠ No |
| 6 | **Requisition → Seats: FeeCell** | Fee invoice number, status, **amount**, link to the invoice | same page | `fetchPlacements`-derived `latestInvoice` | all 6 roles | ⚠ No (amount and link) |
| 7 | **/placements → Invoice column** (table and cards) | Invoice number, status, **amount**, link; "Not invoiced" | `requirePermission('recruitment','placements','view')` (`placements/page.tsx:72`) | `fetchPlacements` (`placements/service.ts:137`) `requireInternalStaff()` | ADMIN, MANAGER, RECRUITER, FINANCE | ⚠ RECRUITER sees amounts. Status may be fine (see §3). |
| 8 | **Client workspace billing** `/clients/[personId]?tab=billing` | Pro-formas, invoices, receipts, payments, refunds | `requireInternalStaff()` | `fetchClientWorkspace` (`clients/workspace-data.ts:158`) `requireInternalStaff()` | all 6 roles | ⚠ No (Candidate Services, but the same pattern) |
| 9 | **Immigration case billing** `/immigration/[id]` | Case invoices and receipts | `requireInternalStaff()` (`immigration/[id]/page.tsx:77`) | `fetchImmigrationCaseBillingHistory` (`read.ts:517`) | all 6 roles | ⚠ No |
| 10 | **/payments** | All payments, invoices, receipts | `requireFinanceRead()` (`payments/page.tsx:28`) ✅ | `fetchPaymentsWorkspace` (`commerce/service.ts:258`) `requireInternalStaff()` | ADMIN, MANAGER, FINANCE | ✅ Page OK. The loader has no defence-in-depth. |
| 11 | **/engagements** | Engagement prices and balances | `requirePermission('candidate_services','engagements','view')` | `fetchEngagements` `requireInternalStaff()` | ADMIN, MANAGER, FINANCE | ✅ |
| 12 | **Main dashboard** `/dashboard`: Revenue, Revenue by business, Finance KPI (invoicing), Invoice aging (AR) | Revenue totals, AR buckets | `requirePermission('main','overview','view')` (`dashboard/page.tsx:58`); only the CSV button uses `canReadFinance()` (`:60`) | `fetchDashboardRevenue` (`dashboard/revenue.ts:214`), `fetchRevenueTrendBySource` (`:263`), `fetchAgingReport` (`billing/aging.ts:66`): `requireInternalStaff()` | ADMIN, MANAGER, FINANCE, plus **any user granted `main.overview.view`** | ⚠ On-screen numbers are wider than the CSV. A STAFF user with `overview.view` sees revenue but is refused the export. |
| 13 | **/reports**: "Revenue by currency & service" table | Revenue rows | `requirePermission('main','overview','view')` (`reports/page.tsx:34`); CSV gated by `canReadFinance()` | `revenueByCurrencyAndService` (`reports/service.ts:78`) `requireInternalStaff()` | same as 12 | ⚠ Same drift as 12 |
| 14 | **CS dashboard revenue card** `/dashboard/candidate-services` | CS revenue | `requirePermission('candidate_services','dashboard','view')` | — | ADMIN, MANAGER | ✅ (narrower than finance read) |
| 15 | CSV `/api/export/payments`, `/api/export/revenue-services`, `/api/reports/revenue` | payments and revenue | `financeReadDeniedResponse()` ✅ (`d0b080d`) | — | ADMIN, MANAGER, FINANCE | ✅ |
| 16 | CSV `/api/export/placements`, `/api/reports/placements` | Placements incl. **candidate salary** | `requireInternalStaff()` only (`api/export/[resource]/route.ts:49,111`; `api/reports/[name]/route.ts:23,28`) | — | all 6 roles | ⚠ Salary isn't billing, but it is compensation data, and it is wider than the `/placements` page itself (`placements.view`). |
| 17 | CSV `/api/accounting/vat/export` | VAT ledger | `requirePermission('main','accounting','view')` | — | ADMIN, MANAGER | ✅ |
| 18 | Invoiceable services catalogue (`fetchInvoiceableServicesFor`, `read.ts:76`) | List **prices** (not records) | — | none | all | ✅ (price list, not financial records). Note: it lazily inserts a PLACEMENT_FEE catalogue row on read. |

**Pattern:** every **page-level** money surface outside `/payments`, `/engagements` and the CSVs
relies on `requireInternalStaff()`. So does **every data loader in `src/modules/billing/read.ts`**.
The only finance-read enforcement today is at the `/payments` page and the three
payments/revenue CSVs. Recruitment pages never consult finance read.

## 3. Proposed policy

### 3.1 Three tiers (no new grant needed)

| Tier | Who (defaults) | May see |
|---|---|---|
| **B0: billing status** | anyone who can open the record (`employers.view`, `requisitions.view` or `placements.view`) | Per placement or job: "Not invoiced / Invoiced / Part-paid / Paid / Voided" as a status pill only. **No amounts, no invoice numbers, no links to documents.** |
| **B1: finance read** | the existing `canReadFinance()`: owner, ADMIN, MANAGER, FINANCE | Amounts, invoice and receipt lists, Billing tabs, invoice/receipt pages, credit notes, payment trail, revenue tiles and tables, AR aging |
| **B2: finance authority** | unchanged (`hasFinanceAuthority`): owner, ADMIN, FINANCE | Issue, verify, void, credit, refund |

Reusing `FINANCE_READ_PERMISSIONS` means the policy **adds no grants** and **narrows only**. Every
user who loses access today also lacks `/payments` access, so the rule becomes "if you can't open
Payments, you can't open an invoice either".

### 3.2 Options for RECRUITER (owner decision)

| Option | RECRUITER sees | Pros | Cons |
|---|---|---|---|
| **R-a: status only (recommended)** | B0 pill on /placements, seats and pipeline. No Billing tab. | Recruiters know whether to chase the fee. No money leaks. Easy to build (drop amount and link when `!canReadFinance`). | Recruiters can't answer "how much was the fee?" without finance. |
| R-b: nothing | No invoice column or pill | Strictest | Loses the useful "Not invoiced" nudge that P0 has just added for raising the fee |
| R-c: amounts for their own placements | B1 data scoped by record ownership | Commission-friendly | Needs ownership-scoped queries on every loader. Harder to audit. Larger change. Not P0. |

### 3.3 MANAGER (owner decision)

The MANAGER preset has `view` on everything, so it already holds finance read and can open
`/payments` today. Options: **keep** (no change), or remove `cs.payments.view` and
`main.accounts.view` from the MANAGER preset. Removing them affects *new* users only; existing
managers would need their grants edited by the owner. **Not a P0 change.**

### 3.4 Exact enforcement points

**Server (data loaders: the real boundary).** Add `await requireFinanceRead()` (instead of, or
after, `requireInternalStaff()`) to:
- `src/modules/billing/read.ts`: `fetchInvoiceForPrint`, `fetchReceiptForPrint`,
  `fetchCreditNotesForInvoice`, `fetchInvoicePaymentTrail`, `fetchRefundablePaymentsForInvoice`,
  `fetchEmployerBillingHistory`, `fetchRequisitionBillingHistory`,
  `fetchImmigrationCaseBillingHistory`, `fetchPersonBillingHistory`,
  `fetchLatestBillingLinksForPerson`
- `src/modules/commerce/service.ts`: `fetchPaymentsWorkspace` (defence-in-depth)
- `src/modules/dashboard/revenue.ts`: `fetchDashboardRevenue`, `fetchRevenueTrendBySource`;
  `src/modules/billing/aging.ts`: `fetchAgingReport`;
  `src/modules/reports/service.ts`: `revenueByCurrencyAndService`
- `src/modules/placements/service.ts`: `fetchPlacements` should return `latestInvoice` as
  `{ status }` only when `!canReadFinance()` (strip `number`, `totalAmount`, `currencyCode`). Keep
  `hasLiveInvoice` because the fee guard needs it.
- `src/modules/clients/workspace-data.ts`: `fetchClientWorkspace` should omit the
  invoices/receipts/payments/pro-formas blocks when `!canReadFinance()` (Candidate Services owner
  to confirm).

**Pages (UX):**
- Invoice and receipt pages (`employers/[id]/invoices|receipts/[number]`,
  `candidates/[id]/invoices|receipts/[number]`): call `requireFinanceRead()` first. The app's
  existing 403 handling renders the denial. Use `notFound()` instead if the owner prefers not to
  confirm that a number exists.
- Employer and requisition **Billing** tab: render it only when `canReadFinance()`. Otherwise
  leave the tab out (no empty "Billing" tab).
- Seats FeeCell and `/placements` invoice column: when `!canReadFinance()`, show the B0 pill only,
  with no link and no amount. The disabled "Raise fee" hint for non-authority users stays as is.
- Main dashboard and /reports: wrap the Revenue, Revenue by business, Finance KPI, AR aging and
  "Revenue by currency & service" sections in `canReadFinance()`, the same flag the CSV buttons
  already use.
- CSV `placements` exports: require `placements.view`, plus finance read for the salary column (or
  drop salary for non-finance users). Owner decision on whether salary counts as finance.

**Audit:** `requireAnyPermission` already writes an auth-denied audit row on refusal
(`session.ts:268`), so denials are logged for free.

### 3.5 What P0 could safely do vs what needs an owner decision

**Narrowing that P0 could do safely.** It only removes access, uses the existing
`requireFinanceRead()`, and adds no grants:
1. Invoice and receipt pages (rows 2–4) and their loaders → finance read.
2. Employer and requisition Billing tabs (rows 1, 5) and their loaders → finance read; hide the
   tab otherwise.
3. Dashboard and Reports on-screen revenue/AR (rows 12–13) → the same `canReadFinance()` gate the
   CSV already uses. This removes the page-vs-export drift that `d0b080d` left.
4. Defence-in-depth `requireFinanceRead()` inside `fetchPaymentsWorkspace` (row 10). No behaviour
   change for anyone who can open /payments today.

Before shipping these, check the existing `stage6b3-role-gating.staff.spec.ts`
(`/clients/<id>?tab=billing` as STAFF, lines 157–167), `finance-exports.staff.spec.ts` (/reports,
/dashboard as STAFF) and `hr-privacy.staff.spec.ts` (/dashboard as STAFF). Their expectations may
need updating, and that is a product decision, not a bug.

**Needs an owner decision:**
- RECRUITER: option R-a / R-b / R-c (rows 6–7).
- MANAGER keeps finance read or not (§3.3).
- Client workspace and immigration billing for non-finance staff (rows 8–9). Today's Candidate
  Services and Immigration workflows may rely on case workers seeing "paid / not paid". Status-only
  (B0) is the likely answer, but it belongs to those workspaces' owners.
- Whether candidate **salary** in placements CSVs (row 16) is finance-restricted.
- 403 vs `notFound()` on invoice and receipt URLs.

## 4. Test plan (for whoever implements)

- **Unit:** a table test over `presetForRole` for each role × each loader: call it with a mocked
  session (pattern: `src/modules/hr/privacy.test.ts`), expect `AuthorizationError` for RECRUITER,
  STAFF and DOC_SPEC, and data for ADMIN, MANAGER, FINANCE and owner.
- **E2E (staff project):** a STAFF user with `recruitment.employers.view` (but no finance grant)
  opens an employer → no Billing tab. A direct GET of `/employers/<id>/invoices/<number>` returns
  403/404. `/placements` shows the "Invoiced" pill but no € amount and no invoice link.
- **E2E (admin):** the same pages still show amounts, documents and the payment trail. Dashboard
  revenue is unchanged.
- **Regression:** the `finance-exports*.spec.ts` suite stays green. On-screen gating now matches
  the CSV gating.
