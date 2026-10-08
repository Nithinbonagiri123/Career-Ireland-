# Ireland Career Gateway CRM — End-to-End UX & Operations Audit

**Status:** blueprint for a serious product rebuild · **Last updated:** 2026-10-08
**Audience:** Tracey (owner) · the engineering team · future hires
**Author's framing:** Written as a senior product designer / UX researcher / business analyst / operations consultant hired to fix a production system employees use every day. Not a cosmetic pass.

> **Read this first.** This audit is honest. I do not protect decisions that already shipped. Where the current app looks professional but is operationally broken, I say so. Where a workflow is confusing enough that a new hire would make a serious mistake, I flag it P0. The goal is a system that is **simple to learn, fast to use, hard to misuse, easy to understand, professional, consistent, scalable, and operationally clear** — in that exact order of priority.

---

## 0. Executive summary

The system is three things stitched together: a candidate CRM, a billing/invoicing stack, and a thin HR layer. Each of those three has been built to roughly the right data model but the **workflows** on top of them haven't been designed as end-to-end operations yet.

The result today:

- The data layer is **good**. Schemas are clean, state machines exist where they matter, audits are solid, VAT math is correct, invoices are immutable by design. Rebuilding would be a mistake.
- The workflow layer is **fragmented**. There's no end-to-end "do this next" story for a new hire. Six separate paths put a person into a pipeline. Three tables mean the same thing (`candidateMatches`, `shortlistEntries`, `jobApplications`). Employer onboarding is a single dialog with 10 optional fields — there's no "I'm done onboarding this client" moment.
- The UX layer is **confused**. Database words leak into UI copy (`PENDING_PAYMENT`, "requisition", "service engagement"). Primary verbs are hidden under three-dot menus. Record pages carry 4–8 header buttons with no hierarchy. Shortlists and Matching are visually indistinguishable. Clock-in is buried on `/hr` instead of in the shell.
- Several **critical operations are missing**: there is no refund flow at all (the system acknowledges refunds happen off-system — see `src/modules/billing/service.ts:486`). There is no new-employee onboarding workflow. There is no visible "my work today" surface. Payment terms are hardcoded at 14 days.

What follows is a per-area audit, five scenario walkthroughs, a proposed information architecture, workflow diagrams for every major process, duplicate functionality + missing connections lists, and a phased plan.

Minimum-viable rebuild (Phase 1 + 2): **~6–8 engineering weeks** to go from "fragmented" to "operationally coherent", without touching the data model.

---

## 1. Recruitment / Requisition Workflow

### What exists today

- `jobRequisitions` has a clean 7-state machine (DRAFT → OPEN → IN_PROGRESS → PARTIALLY_FILLED → FILLED → CLOSED/CANCELLED), enforced in `src/lib/state-machine.ts:60-69`.
- Six distinct paths put a person onto a requisition's pipeline (manual match, assisted matching run, manual shortlist, direct internal application, external application log, prospect conversion). All six land in one of three tables: `candidateMatches`, `shortlistEntries`, `jobApplications`.
- Pipeline wall at `/requisitions/[id]?tab=pipeline` dedup's across the three tables into seven visible stages.

### Problems

**Problem 1.1 — Three tables are not three workflows.** `candidateMatches`, `shortlistEntries`, and `jobApplications` all represent "person is connected to this job in some way". The data model separates them (match = algorithm scored, shortlist = human picked, application = formal application). But the pipeline wall treats them as a single funnel. The operator doesn't know which table a candidate card lives in — and it affects what they can do with it.

- **Why it's a problem:** A new hire sees "Priya is in the Shortlist column". They try to move her to Interview. The UI appears to allow it. Under the hood: Priya is in `shortlistEntries`, not `jobApplications`. The pipeline advance needs to CREATE a `jobApplications` row first (via `createApplication()` at `src/modules/applications/service.ts:182`). If the operator doesn't understand this, they can double-move the same person.
- **Recommended workflow:** Collapse the three tables operationally into one visible timeline. The DB keeps three tables; the UI shows **one journey**. Each advance button is explicit about what it does ("Promote Priya to the applicant list"). The pipeline wall shows a single horizontal row of stages that always exist (Sourced → Reviewed → Shortlisted → Applied → Interview → Offer → Placed). Each card shows which "layer" it's at via a subtle badge, but every verb on the card describes the *outcome*, not the DB operation.

**Problem 1.2 — Eight-button toolbar on a requisition.** `/requisitions/[id]` header currently shows: Assign to me · Reassign · Edit · Add candidate · Add outsourced · Run assisted matching · Start advertisement · Set reminder · Close requisition. That's 9 verbs stacked across the top with no hierarchy.

- **Why it's a problem:** New hire opens the page and has no idea where to click. All 9 look equally important. Experienced operator has to scan the whole row every time instead of eye-tracking to the right spot.
- **Recommended workflow:** One primary verb (state-aware, carried from Session 7's NextActionCard CTA). Two secondary visible verbs (the next most-likely moves in the current state). Everything else under a single `More ⋯` dropdown. State-exclusive — the row never shows a verb that doesn't make sense for the current status.

**Problem 1.3 — "Uploaded completed work" is not a first-class concept.** When a recruiter finishes a requisition's work (candidate submitted, interview scheduled, offer letter sent, etc.) there's no obvious surface where that work is tracked and ticked off. The `tasks` table exists but requisition work doesn't flow through it as a checklist.

- **Why it's a problem:** Operations manager has no visibility into "is this requisition's work actually done?" They have to open the record and reason about it. For a business filling 20+ jobs at once, this doesn't scale.
- **Recommended workflow:** Add a per-requisition **Work Log** section. Pre-seeded with standard milestones (Sourced 5 candidates / Shortlisted 3 / Scheduled interviews / Sent offer / Documentation received / Placed). Operator ticks them off. The requisition's "progress" is literally the % of milestones complete, not a derived number from the status enum.

### UI changes
- Replace the current pipeline wall header with a one-row **stage summary** (name of stage + count + a tiny visible verb for the stage's primary advance action).
- Add a `WorkLog` component under the pipeline wall. See §26 for the shape.
- Collapse the 8-button toolbar via a shared `<RecordHeaderActions primary secondary[] overflow[] />` primitive (same pattern used in Phase 2 §1 Gap B).

### Information architecture changes
- Rename user-facing "Requisition" → either "Job" or "Role" (owner picks). The DB table stays `jobRequisitions`.
- Nav section stays "Recruitment".

### Priority
- 1.1 — **P0** (prevents an operator mistake)
- 1.2 — **P1**
- 1.3 — **P1**

---

## 2. Candidate Management

### What exists today

- Candidate = `persons` row + `candidateProfiles` row. Lifecycle enum: `ACTIVE | INACTIVE | ARCHIVED`. Availability enum: `AVAILABLE | TEMPORARILY_UNAVAILABLE | PLACED`. Session 9 collapsed those into one visible chip (good).
- CV upload + extraction via `/modules/cv-parse/`. Suggestions appear on the candidate record as a panel.
- Candidate record page has tabs: Overview / Applications / Documents / Billing / Activity.
- Session 2 shipped the NextActionCard — a state-aware "what to do next" row.

### Problems

**Problem 2.1 — Profile / Reach duplication on the candidate card.** The `/candidates` grid tile has two buttons: **Profile** (green) and **Reach** (pink). "Reach" opens the Applications tab. Nobody knows what "Reach" means without being told.

- **Why it's a problem:** Non-tech users guess "Reach out?" or "Reach a decision?" — neither is what it does. First-time users click the wrong button.
- **Recommended:** Collapse to one primary **Open** button that opens the full profile. Secondary verbs (Contact / Add note / Add to requisition) belong **inside the record**, not on the tile. Tile stays a quick-look surface.

**Problem 2.2 — CV extraction has no "I've reviewed this" step.** Current flow: upload CV → parser extracts fields → operator sees them in a sidebar panel on the candidate record. There's no "review these, click Apply, continue" moment. Extracted information coexists with manually-entered information with no clear ownership.

- **Why it's a problem:** Extracted data can be wrong (dates, phone numbers, nationality). Operator doesn't know if a given field is "we got this from the CV, double-check it" or "we got this from the person, trust it".
- **Recommended workflow (Scenario 1 — new candidate):**
  1. **Upload CV** (drag-and-drop single step)
  2. **Extraction preview** — split-screen: PDF on the left, extracted fields on the right, each field with a confidence badge (High / Medium / Low) and a tiny "edit" icon
  3. **Review & correct** — operator fixes low-confidence fields inline
  4. **Save as draft candidate** — a draft candidate row exists until the operator completes the required fields
  5. **Progressive disclosure of remaining required fields** (payment-and-service section)
  6. **Finalise** — candidate goes live, invoice issued, receipt generated
- **UI change:** Introduce a `CvReviewStep` component with the split-screen layout. The existing `/candidates/new?draft=…` route already supports a draft candidate — extend it.

**Problem 2.3 — Pipeline stages are visually weak.** The current pipeline wall uses coloured orange/pink/green cards. From a scan, every card looks the same.

- **Why it's a problem:** At 100+ candidates in a pipeline, the operator can't tell at a glance who's new vs who's stuck.
- **Recommended visual language:**
  - Each candidate card has one dominant status chip (not three)
  - Days-in-stage shown as a muted number (so "stuck" candidates — >14 days in one stage — can be visually filtered)
  - Owner avatar in the top-right corner (name on hover) — ownership visible without opening a dialog
  - "Next action" verb inline on the card for the primary advance move

### Candidate stage system
Per your prompt's suggested stages (New / Reviewing / Shortlisted / Submitted / Interview / Offer / Documentation / Immigration / Onboarding / Placed / Started / Completed / Rejected / Withdrawn):

Current system has 7 pipeline stages (Sourced / Reviewed / Shortlisted / Applied / Interview / Offer / Placed) + a placement lifecycle (Placed → Started → Completed) + a candidate lifecycle (Active / Archived) + an immigration case lifecycle (parallel). This is actually **close to right** — the business doesn't need all 14 stages you listed because Documentation + Immigration are their own parallel case types that get their own tracker.

- **Recommended stage model (operational, not DB):**
  - **Pre-pipeline:** New (just a person) · Reviewing · Shortlisted
  - **In pipeline:** Applied · Interview · Offer · Accepted
  - **Post-offer:** Documentation · Immigration (parallel, not sequential) · Onboarding · Started · Completed
  - **Terminal:** Rejected · Withdrawn
- **Why some of your stages aren't new concepts:**
  - "Submitted" = our "Applied"
  - "Immigration" = already its own case type with its own 7-state machine
  - "Documentation" = already handled per-case via the `documents` module

### Priority
- 2.1 — **P1**
- 2.2 — **P1** (the extraction review is the #1 operational win for a recruiter)
- 2.3 — **P2**

---

## 3. Immigration Workflow

### What exists today

- `immigrationCases` has a proper 7-state machine (OPEN → DOCUMENTS_PENDING → SUBMITTED → UNDER_AUTHORITY_REVIEW → APPROVED/REJECTED → CLOSED), enforced in `src/lib/state-machine.ts:71-87`.
- Per-case document requirements (`immigrationCaseDocumentRequirements`) with per-doc status (MISSING / PROVIDED / ACCEPTED / REJECTED) and mandatory level (MANDATORY / OPTIONAL).
- NextActionCard on the case detail page (Session 2) + state-aware verbs (Set reminder / Record decision / Close case) from Session 5.
- Cases are visible on candidate record AND employer record (Session 11).

### Problems

**Problem 3.1 — All immigration state crammed into one tab.** Case detail page has tabs: Overview / Documents / Tasks. The Overview tab tries to show case details + beneficiary + sponsor + billing all at once. Documents tab shows the requirement checklist + attached documents. Tasks shows per-case tasks.

- **Why it's a problem:** New hire opens the case and sees a wall of fields. They don't know what to do next. The NextActionCard helps but it's one sentence, not a workflow.
- **Recommended workflow — one page, four phases:**
  1. **Intake phase** (status: OPEN or DOCUMENTS_PENDING) — big visible card: "Request these documents from Rohan. Email button here." · progress bar: 2 of 6 mandatory docs received.
  2. **Submission phase** (status: SUBMITTED or UNDER_AUTHORITY_REVIEW) — big visible card: "Submitted on 24 Sep. Set a reminder for 24 Oct." Reminder dialog inline.
  3. **Decision phase** (status: APPROVED or REJECTED) — big visible card: "Decision recorded on 15 Oct. Approved. Next: archive and start onboarding."
  4. **Terminal phase** (status: CLOSED) — minimal: "Case closed. [Open candidate →]"
- Each phase replaces the main content area as the status moves. Secondary info (beneficiary, sponsor, billing) stays in the sidebar — scannable but not loud.

**Problem 3.2 — Document requirement workflow is invisible to the beneficiary.** The checklist is operator-facing. The candidate has no way to see "what documents does Ireland Career Gateway still need from me?"

- **Why it's a problem:** Operators end up chasing the same documents via email because candidates don't know what's outstanding.
- **Recommended:** Reuse the existing `document-upload-requests` module (which already supports candidate self-upload). On the immigration case page, add a **Request documents from beneficiary** button that generates a secure upload link per missing requirement and sends it to the beneficiary. The upload automatically fulfils the requirement. Mentioned in Session 2 audit but not yet wired for immigration cases specifically.

**Problem 3.3 — No "What's needed to apply" preview before opening a case.** Opening a case commits the operator to a specific application type. There's no quick-check: "If I open a Critical Skills Work Permit for Rohan, what documents will I need from the sponsor employer?"

- **Why it's a problem:** Operators open cases, discover the sponsor can't produce a required doc, have to abandon or change case type. Rework.
- **Recommended:** Show a preview panel on the case-create dialog that lists the required documents for the picked application type. Pulled from the admin `/admin/immigration-types` config.

### Priority
- 3.1 — **P0** (the operational heart of the immigration business)
- 3.2 — **P1**
- 3.3 — **P2**

---

## 4. Company Onboarding

### What exists today

- `employers` table has 8 fields total (legal name, trading name, website, industry, country, city, relationshipStatus, notes). Only `legalName` is required (zod schema at `src/modules/employers/schemas.ts:7`).
- Contacts are a separate dialog (`ContactDialog`), not part of employer creation.
- No "billing information" fields (VAT ID, invoice address, payment terms).
- No "company documents" table.
- No advertising requirements.
- No "I've finished onboarding" moment.

### Problems

**Problem 4.1 — Onboarding is a dialog, not a flow.** Current `EmployerDialog` is a modal with 8 optional fields. The operator fills what they feel like and clicks Save. The employer is now "onboarded" even though critical commercial information is missing.

- **Why it's a problem:** Six months in, invoices get raised to this employer and bounce because there's no billing email. Or VAT is required and nobody knows the VAT ID. Or the hiring manager contact was never added.
- **Recommended workflow — a proper multi-step onboarding:**
  1. **Basics** — legal name, trading name, industry, website (required: legal name, industry)
  2. **Address** — invoice address (required if billing enabled)
  3. **Primary contact** — hiring manager name, email, phone (required)
  4. **Billing** — invoice email, VAT ID (conditional on VAT), payment terms override, preferred currency (optional, defaults from app settings)
  5. **Documents** — upload Articles of Incorporation / proof of registration (conditional on jurisdiction)
  6. **Services needed** — recruitment / immigration sponsorship / advertising (checkboxes; determines what panels appear later)
  7. **Review & complete** — summary + "Mark onboarding complete" button
- Draft employers (same pattern as draft candidates — `is_draft` column) persist between steps. Operator can save & finish later.

### Required / Recommended / Optional / Conditional

| Field | Classification | Rule |
|---|---|---|
| Legal name | Required | Always |
| Industry | Required | Always |
| Trading name | Optional | — |
| Website | Recommended | Warn if missing: "Candidates will ask" |
| Invoice address | Conditional | Required if any service will be billed |
| Primary contact | Required | At least one named person |
| Invoice email | Required | For billing |
| VAT ID | Conditional | Required if VAT enabled AND jurisdiction = Ireland/EU |
| Payment terms override | Optional | Falls back to app default |
| Company registration doc | Conditional | Required if sponsoring work permits |
| Articles of Incorporation | Optional | — |

### Priority
- 4.1 — **P0** (financial correctness depends on this)

---

## 5. Running a Requisition for a Company

### Workflow problems

The current path from "I'm looking at Company X" → "I'm actively working on their job req" is clear enough on paper but **context is lost** at each hop:

- Open `/employers/[id]` → see list of their requisitions
- Click a requisition → `/requisitions/[id]` opens, but the employer context is in a tiny breadcrumb at top-left
- Need to go back to employer? Breadcrumb only. No company panel on the requisition page.

### Recommended

Add a persistent **client strip** to the requisition page: a thin horizontal row above the main content with the employer logo, name, hiring manager contact, and a "Back to {employer}" link. Costs 32px of vertical space; makes the context never go away.

Same strip on an immigration case: beneficiary + sponsor employer always visible.

### Priority
- **P1**

---

## 6. Company Advertising Workflow

### What exists today

- `campaigns` + `advertisements` tables (`src/lib/db/schema/campaigns.ts`).
- Campaigns live under `/campaigns`, not under the employer or the requisition.
- Session 5 added "Start advertisement" from the requisition header (deep-link to `/campaigns?requisitionId=…`).
- Prospects (campaign responders) land in `/prospects`.
- **No connection between an advert and its invoice.** The schema doesn't link `advertisements` to `invoices`.

### Problems

**Problem 6.1 — Adverts aren't visible on the employer or requisition page.** You can start an advert from a requisition but you can't see "which adverts are running for this employer" from the employer record. You have to go to `/campaigns` and filter.

**Problem 6.2 — Advert payment isn't a first-class flow.** A paid advert is just a service engagement with no visible link to the actual advertisement row.

### Recommended workflow

**Advert billing path:**
1. Operator starts advert from requisition → Campaign dialog opens with requisition pre-filled
2. Save campaign → operator is prompted "Raise invoice for this campaign to {employer}?"
3. Clicking Yes creates an invoice linked to the campaign + the employer + the requisition
4. Advert goes LIVE only when the invoice is marked paid (optional policy, configurable)
5. Prospects from the advert flow into the requisition's pipeline automatically

**Add to schema:** `advertisements.invoiceId` nullable FK. One advert → zero-or-one invoice.

**Add to UI:**
- Employer record: new "Advertising" card listing current + past campaigns + invoice status
- Requisition record: inline advert status in the "Advertising" section

### Priority
- 6.1 — **P1**
- 6.2 — **P1**

---

## 7. Invoices, Receipts, Payments, Refunds, Credit Notes

### What exists today

The money model is **well-built**:
- Immutable invoices (correct for Irish VAT law)
- Credit notes for corrections
- Automatic receipt generation on payment verification
- Shadow-ledger with VAT-aware event emission
- Payment overpayment guard

### What's missing

**Problem 7.1 — Refunds are not implemented at all.** `src/modules/billing/service.ts:486` comment: *"refund happens off-system"*. Operators have to:
1. Issue a credit note in the CRM
2. Transfer money back to the customer via their bank app
3. Record a manual ledger entry

The CRM has no refund record, no refund status, no visible refund workflow.

- **Why it's a problem (P0):** For a business processing hundreds of payments, "off-system refunds" is a bookkeeping disaster waiting to happen. One missed refund = one angry customer + accounting mismatch at year-end.
- **Recommended workflow (Scenario 5 end-to-end):**
  1. Operator opens an invoice → sees "Refund" button (visible only when invoice has at least one VERIFIED payment)
  2. Click Refund → focused dialog opens with:
     - Which payment are you refunding? (dropdown — list of VERIFIED payments on this invoice)
     - Original amount (readonly)
     - Already refunded (readonly, sum of prior refunds on this payment)
     - **Refund amount** (editable, defaults to remaining refundable)
     - **Reason** (required text, audited)
     - Checkbox: "Issue credit note automatically" (default on)
     - Checkbox: "Mark payment status as REFUNDED" (default on)
  3. On confirm:
     - A `refunds` row is created (new table)
     - A credit note is auto-issued for the refund amount
     - The payment's status is updated to REFUNDED (new status) or PARTIALLY_REFUNDED
     - The invoice's `outstandingAmount` is recomputed
     - An audit event is written
     - Toast: "Refund of €150 recorded. Credit note CN-2026-0012 issued."
- **New schema:** `refunds` table + add `REFUNDED` / `PARTIALLY_REFUNDED` to `payments.status` enum.
- **Edge cases handled by the dialog:**
  - Cannot refund more than paid-minus-already-refunded
  - If invoice is VOIDED, refund still works (void doesn't erase the payment)
  - If invoice is PAID, the first refund flips it to PARTIALLY_PAID again

**Problem 7.2 — No payment terms per invoice.** Every invoice is "due in 14 days" (hardcoded `OVERDUE_THRESHOLD_DAYS` at `src/modules/billing/aging.ts:15`). A 30-day-net client gets flagged as overdue at day 15.

- **Recommended:** Add `invoices.dueAt` (date). Default = `issuedAt + employer.paymentTermsDays || app.defaultPaymentTermsDays`. Shown on the invoice printable. Driven by employer-level setting (see §4).

**Problem 7.3 — Financial state isn't rolled up anywhere.** No summary card showing "This employer owes you €4,250 across 3 invoices, 1 overdue". Each record page shows its own billing list.

- **Recommended:** Add a `FinancialSummaryCard` to employer + candidate records. One line: owed · overdue · last paid. Click → opens full billing history.

### Priority
- 7.1 — **P0**
- 7.2 — **P1**
- 7.3 — **P2**

---

## 8. VAT

### What exists today

- Global `appSettings.vatRatePercent` (one rate for the whole business)
- Invoice totals calc: `taxAmount = subtotal × (vatRatePercent / 100)` (`src/modules/billing/service.ts:106`)
- Shadow-ledger emits tax separately (good for VAT returns)
- Admin page `/admin/accounting/vat` for the return
- Credit notes pro-rate tax correctly

### Problems

**Problem 8.1 — Global rate only.** Ireland has multiple VAT rates (standard 23%, reduced 13.5%, second reduced 9%, zero-rated). A recruitment business selling "Candidate Services" might charge 23%; selling "Educational Training" might be zero-rated.

- **Recommended:** Move VAT rate to **per-service-catalog-item** level. `serviceCatalogItems.vatRatePercent` (nullable — falls back to app default if null). Invoice line items store the rate used at issue time (already immutable).

**Problem 8.2 — No "VAT disabled" mode.** The business may launch pre-VAT-registration. Current app always calculates VAT (even if rate is 0, the ledger still emits a tax event).

- **Recommended:** Add `appSettings.vatEnabled` boolean. When false:
  - No VAT line on invoices
  - No VAT ID field required at employer onboarding
  - `/admin/accounting/vat` page shows "VAT disabled — enable in Settings"
- Existing invoices with VAT are not touched when the setting changes (immutability wins).

**Problem 8.3 — No per-employer VAT exemption.** Some B2B customers are VAT-exempt (EU reverse charge, non-EU, charity, etc.).

- **Recommended:** `employers.vatTreatment` enum (`STANDARD`, `REVERSE_CHARGE`, `EXEMPT`, `OUTSIDE_SCOPE`). Shown on invoices as "VAT 0% — reverse charge" etc.

### Priority
- 8.1 — **P2** (upcoming requirement)
- 8.2 — **P1** (blocks real launch)
- 8.3 — **P1**

---

## 9. Employee / Internal HR System

### What exists today

- `users` table carries the account + the role.
- `staffProfiles` (hr.ts) extends users with department, position, joining date, manager, status.
- `/admin/users` list + create dialog.
- `/admin/users/[id]/permissions` page — a matrix editor.
- **No `/admin/users/[id]` detail page.** The only user-scoped page is the permissions matrix.
- `/hr` self-service page + `/hr/admin` directory for admins.
- No employee onboarding workflow.

### Problems

**Problem 9.1 — Adding an employee is a two-stop journey.** Admin creates a user at `/admin/users`, then goes to `/hr/admin` and edits the directory to add their department/position/manager. Nothing links the two steps. No one tells the admin that step 2 is required.

- **Why it's a problem:** Employees exist in the system without an HR profile. Their permissions work (role-based) but reporting breaks (no manager, no department).
- **Recommended workflow — multi-step employee onboarding:**
  1. **Personal information** — full name, email, phone
  2. **Employment information** — department, position, joining date, employment type, line manager
  3. **Access & permissions** — role preset (ADMIN / MANAGER / RECRUITER / FINANCE / DOCUMENT_SPECIALIST / STAFF) · preview of what they'll be able to do
  4. **Documents** — upload offer letter, signed contract, ID (conditional on company policy)
  5. **Payroll** — salary band, tax ID, bank details (optional at onboarding, required before first payroll run)
  6. **Review & send welcome email** — triggers the account activation
- Draft employees persist between steps.

**Problem 9.2 — No employee detail page.** There's no `/admin/users/[id]` that shows "here's everything about this employee": profile, permissions, cases they own, hours worked this week, recent activity.

- **Recommended:** Build a proper `/people/[userId]` page with tabs: Overview · Permissions · Assigned Work · Attendance · Documents · Activity.

**Problem 9.3 — Employees ≠ Candidates — but there's no mental distinction.** Current nav has HR in a workspace. Candidates in a different workspace. Workspaces are a hidden concept. A business owner opening the app can't immediately find "where do my employees live?"

- **Recommended:** Dedicated top-level **People** section (see §25 IA).

### Priority
- 9.1 — **P1**
- 9.2 — **P1**
- 9.3 — **P2**

---

## 10. Permissions

### What exists today

- Fine-grained: (business × module × verb × user) rows in `user_permissions`.
- Verbs cascade: `manage` includes `delete`, `edit`, `create`, `view`.
- Role presets at user creation.
- Matrix editor at `/admin/users/[id]/permissions`.
- Owner bypass.

### Problems

**Problem 10.1 — Permission matrix is overwhelming.** Thirty-plus checkboxes. For a non-technical admin, it's intimidating.

- **Recommended:**
  - **Primary view: role presets.** Admin picks "RECRUITER" from a dropdown. All checkboxes update to match the preset.
  - **Advanced view: individual overrides.** Collapsed by default. Admin can expand to tweak individual permissions.
  - **Preview panel:** "This user will be able to…" — a plain-English summary of what they can do.
- Pattern: Roles + presets + opt-in exceptions, not raw matrices.

**Problem 10.2 — Role vs permissions are decoupled after creation.** A user is created with role = RECRUITER (gets recruiter preset). An admin later changes individual permissions. Now role says RECRUITER but permissions don't match. There's no "this user has deviated from their preset" indicator.

- **Recommended:** Show a `Modified` badge next to the role when the actual permissions diverge from the preset. Button: "Reset to {role} preset".

### Priority
- 10.1 — **P1**
- 10.2 — **P2**

---

## 11. Clock In / Clock Out

### What exists today

- `/hr` page has a `ClockPanel` with live timer, Clock In / Start break / Clock out verbs.
- Status (Working / On break / Off the clock) only visible on `/hr`.
- No shell/topbar indicator anywhere else.

### Problems

**Problem 11.1 — You have to navigate to `/hr` to clock in or out.** An operator starting their day has to find the Attendance menu item, click it, click Clock In, then go back to Dashboard. End of day: same.

- **Why it's a problem:** Friction. People will forget to clock out. HR data gets inconsistent.
- **Recommended:** Add a small **ClockWidget** to the global topbar (next to the notifications bell + theme toggle):
  - When clocked out: `[● Clock in]` button
  - When clocked in: live elapsed timer `02:14:32` + a small `[Stop]` button
  - Click the timer → expands to show today's totals + break controls
- The widget is state-aware. The `/hr` page becomes "attendance history + reports" rather than "clock in/out".

### Priority
- 11.1 — **P1**

---

## 12. Dashboard

### What exists today

- Session 4 shipped: Quick Actions row + "What needs doing" + KPI strip + Finance + Revenue + Operational pipelines + "Attention" panel.
- But: no **My Work** vs **Team Work** split. The "What needs doing" cards are workspace-wide, not user-scoped.

### Problems

**Problem 12.1 — Dashboard is a stat board, not a workbench.** The brief (section 25) explicitly asks for this to be fixed. Session 4 was a partial fix. Still:
- No "my cases" vs "team cases" split
- No "am I clocked in" view
- No "what's assigned to me today" list
- The KPI numbers are nice but don't tell me what *I* should do

### Recommended Dashboard

Three vertical sections, top to bottom:

**Section A — "Here's your morning"**
- Clock widget (big — "Clock in" button if you haven't)
- "You have 4 cases that need action today" + a sparse list of the top 4
- "You placed 2 candidates this week" (celebration micro-copy)

**Section B — "My work"**
Three cards:
- **My cases** (3 open, 1 overdue)
- **My candidates** (12, 2 needing documents)
- **My requisitions** (5, 1 at offer stage)
Each card drills down to the user-scoped list.

**Section C — "Team work"** (visible to managers/admins only, controlled by permission)
Three cards:
- Unassigned work (4 cases, 2 leads)
- Team activity today (12 clock-ins, 3 placements)
- Pending approvals (2 payments to verify)

Current KPI strip and Revenue section demote to the bottom (fold them under a `Business metrics` collapsible — financially informative but not operationally urgent).

### Priority
- 12.1 — **P0** (the dashboard is the first thing every user sees every day)

---

## 13. "My Cases" vs "Team Cases"

Already covered inside §12. The audit's standalone point here: **every assignable record type needs a "My / Team / Unassigned" scope filter**. Session 2–9 added `assigned=me|unassigned|all` to 6 pages. Need to:

- Ensure Tasks page has this filter (currently absent — flagged in agent report)
- Standardise the UI (same component in the same position on every list)
- Add an owner avatar + name to every list row (currently buried in the Assigned column on tables; invisible on card grids)
- Add a visible "Owned by: {name}" line to every record detail page header

### Priority
- **P1**

---

## 14. Uploading Completed Work

Already covered inside §1 Problem 1.3 — the Work Log concept. Immigration cases need the same thing (the per-case document checklist IS the work log for immigration — good).

Specific gap: when a recruiter sends out an offer letter or receives a signed contract, there's no obvious upload surface. Documents exist on the candidate; nothing attaches them to "this specific requisition's offer".

### Recommended
Per-requisition `Deliverables` section (part of Work Log in §1). Operator attaches offer letter here. Candidate sees it on their portal (future). Audit trail: who uploaded what, when.

### Priority
- **P1**

---

## 15. CV Upload and Data Extraction

Already covered inside §2 Problem 2.2. The split-screen review is the fix.

### Priority
- **P1**

---

## 16. Navigation and Information Architecture

### What exists today

Workspace switcher (Main / Candidate Services / Recruitment / Immigration) + per-workspace nav items. Nav structure is in `src/components/shell/nav-config.ts`.

### Problems

**Problem 16.1 — Workspaces are a hidden concept.** Non-tech users don't know what a workspace is. They see "Candidate Services" at the top of the sidebar and think it's a module, not a filter.

**Problem 16.2 — Business concepts are split across workspaces.** Candidates live in Candidate Services. Candidates ALSO show up in Recruitment (as applicants). The same person has two "homes" depending on which workspace is active.

**Problem 16.3 — Admin area is a cluster of 15 lookup-table pages.** `/admin` has 15 cards grouped under 4 sections. Non-tech admin opens it and has no idea what "Reference data" means.

### Recommended IA

See §25 for the full proposal. Short version:

- **Drop workspaces entirely.** They solve a problem that permissions should solve. If a FINANCE user doesn't need to see /candidates, use permissions to hide it from the sidebar.
- **Top-level nav (always visible):** Home · Recruitment · Immigration · Finance · People · Reports · Settings
- Each is a section — expanded by default — with child items underneath.
- **One home for every concept.** Candidates live under Recruitment. Clock-in moves to the shell widget (§11). Admin becomes "Settings".

### Priority
- 16.1/16.2/16.3 — **P1**

---

## 17. Terminology

Session 8 did a sweep. More cleanup needed. The owner has pushed back on some terminology changes (see memory). Here's the honest list — do them if you agree:

| Current | Recommended | Why |
|---|---|---|
| Requisition | Job (or Role) | Nobody outside HR says "requisition" |
| Prospect | Enquiry (campaign responder) | "Prospect" is sales jargon |
| Service engagement → Service | ✅ shipped Session 8 | — |
| Shortlist entry | Shortlisted candidate | DB word, not business word |
| Candidate match | Suggested candidate | "Match" is algorithmic, not operational |
| Reach (button) | Contact | "Reach" is meaningless |
| Table (view toggle) | List | "Table" is tech-speak |
| CSV (download) | Download | Format is an implementation detail |
| Reference data | Settings & lists | DB-speak |
| Workspace | — | Drop concept entirely (see §16) |
| Placement | Hire | More operational |

Owner has said leave the P1 terms (Requisition / Lead / status enums / time shortcuts / Table / CSV / Finance copy) as-is. Keeping that call. The remaining items here are new/different and can be re-decided.

### Priority
- **P2** (none individually critical; cumulatively valuable)

---

## 18. Forms

Session 6 sectioned the big three dialogs (Employer / Requisition / Immigration). Still needed:

- **Candidate onboarding** — the biggest single form in the app. Currently is already stepped (good) but doesn't surface the CV-extraction flow from §2.
- **Payment verification** — currently a verify/reject on an existing payment. Needs a two-field explain-the-amount check for operator safety.
- **Refund dialog** — doesn't exist (see §7.1).
- **Credit note dialog** — exists; could use the §7 refund flow improvements.
- **Employee onboarding** — doesn't exist (see §9.1).

### Form principles (apply everywhere)

Where am I? → section eyebrow label (shipped in Session 6)
What do I need? → required fields marked, optional fields hidden until needed
What's optional? → tiny `(optional)` label in muted type
What happens when I click Continue? → button says the specific next step: "Save & add contacts", not "Submit"
Can I save and come back? → draft state for every multi-step form (shipped for candidate onboarding; need for employer + employee)

### Priority
- **P1**

---

## 19. Statuses and Progress

Current state: every entity has its own status enum. Session 9 unified display on candidates. Need the same discipline across the board.

### Recommended per-entity status model

For each major entity, declare:
- **Current status** — the enum value
- **What it means** — one plain-English sentence (shown on hover)
- **Who's responsible** — the owner column
- **What's next** — the NextActionCard sentence (shipped Sessions 2-3)
- **Allowed transitions** — enforced by the state machine (shipped)

For STATUS DISPLAY: **always** use the pattern `[colour dot] Human label` — not `ALL_CAPS_WITH_UNDERSCORES`. Session 8 renamed `service engagement` but not status enum values. Owner pushed back on this one; respecting that call. Flagging it here anyway — nothing else in the app will feel more "developer wrote this" than a chip that reads `UNDER_AUTHORITY_REVIEW`.

### Priority
- **P2** (owner has declined); keeping as recommendation only

---

## 20. Reduce Cognitive Load

Three concrete rules the system should follow:

### Rule 1 — No screen without a primary action
Every page shows ONE verb more prominently than the rest. Record pages: NextActionCard (Session 2-3). List pages: a filled `[+ New X]` in the top-right (shipped). Admin pages: the primary setting change. Settings pages: a Save button.

### Rule 2 — No form without progressive disclosure
A form with more than 6 fields visible at once is wrong. Section them (Session 6 shipped the primitive). Collapse the optional sections by default.

### Rule 3 — No list without a scope filter
Every list page defaults to "My work" where the entity is assignable (currently defaults to All). Flip the default. Users can switch to All with a tab click.

### Priority
- **P1** (behavioural change across all surfaces)

---

## 21. Professionalism

Already covered in `docs/ux-audit-phase2.md`. Short version:

- Consistent spacing (shipped via Tailwind + the design-system components)
- Consistent typography (same)
- Consistent buttons (shipped — `<Button variant size>`)
- Consistent status indicators (Session 9)
- Consistent tables (shared DataTable)
- Consistent forms (Session 6 + FormSection primitive)
- Consistent terminology (Session 8 + §17 above)
- Clear hierarchy — **gap, see §1.2 toolbar dump**
- Professional empty states — **gap, see §17 CSV / Table**
- Professional error messages — mostly good; Sonner toasts carry the error text from the server
- Clear confirmations — currently `window.confirm` for destructive actions. Should be a styled confirmation modal.
- Clear success states — Sonner green toast is adequate.
- Good responsive behaviour — not audited at mobile widths; separate pass needed.

### Priority
- **P2** (mostly in good shape)

---

## 22-23. Scenario Walkthroughs

### Scenario 1 — New candidate (CV → onboarding → placement)

**Current experience:**
1. Operator clicks "+ New candidate" from Quick Actions or /candidates
2. Lands on `/candidates/new?draft=…`
3. Fills first + last name + payment amount
4. (Optionally) uploads a CV via DocumentUploader — CV parse runs as a side effect
5. CV suggestions appear on the newly-created candidate record **after save** — not during the flow
6. Operator either accepts suggestions or re-enters data manually
7. Done

**Pain points:**
- CV extraction isn't part of the onboarding flow. The suggestions appear AFTER save, in a sidebar panel. Operator either sees them and manually updates fields (slow) or ignores them (data loss).
- The payment section demands "Received on" + currency + method up front even if the candidate hasn't paid yet.

**Recommended experience:** See §2 Problem 2.2 — split-screen CV review integrated into the flow.

### Scenario 2 — New company → first requisition → first invoice

**Current experience:**
1. Operator clicks "+ Company" from Quick Actions → lands on /employers
2. Clicks "+ New employer" → EmployerDialog opens (8 optional fields, 1 required)
3. Fills legal name, saves
4. Employer page opens → no NextActionCard fires (because state machine doesn't know what to prompt)
5. Operator has to figure out: now what? Add contacts? Add requisition? Set up billing?
6. They click "New requisition" → RequisitionDialog
7. Save requisition → requisition page opens with 8 header buttons

**Pain points:**
- The onboarding is one dialog. No notion of "I'm done onboarding this client."
- Billing info is never collected. First invoice they raise against this employer will have no VAT ID, no billing email, no payment terms.
- There's no "finish setting up this employer" nudge.

**Recommended:** Multi-step onboarding (see §4) with a visible progress indicator ("Employer onboarding: 60% complete — 2 steps left").

### Scenario 3 — New employee onboarding

**Current experience:**
1. Admin opens `/admin/users` → "New user" dialog opens
2. Fills email, name, role, password → saves
3. User now exists but has no HR profile. Nobody tells the admin this.
4. Admin goes to `/hr/admin` → clicks Staff Directory → edits the row to add department etc.
5. User gets no welcome email. Admin manually shares their password out of band.

**Pain points:**
- Two-stop journey without any flow guidance
- No welcome email
- No visibility into whether the user has actually logged in and set up their account

**Recommended:** Multi-step employee onboarding (see §9.1) with final "send welcome email" step.

### Scenario 4 — Recruitment case assigned to an employee

**Current experience:**
1. Manager assigns a candidate case to Nithin via Reassign dialog
2. Audit event is logged (good)
3. Nithin receives… nothing. No email, no task, no notification.
4. Nithin discovers the assignment next time he opens the candidate detail page

**Pain points:**
- Assignment should trigger a notification (shipped notifications module exists at `/notifications` but assignment flow doesn't use it)
- No automatic task created ("Review Priya's documents by Friday")

**Recommended:** On assignment, emit a notification to the assignee + optionally create a follow-up task with a default due date (next business day).

### Scenario 5 — Payment → verification → receipt → refund

**Current experience:**
1. Payment is recorded against an invoice
2. Admin verifies the payment → receipt auto-generated (good)
3. Customer later asks for a refund → **no refund flow exists**
4. Operator issues a credit note (reduces invoice outstanding)
5. Operator transfers money back manually via their bank
6. Nothing in the CRM reflects that money moved. The payment is still VERIFIED. The receipt still shows "money received".
7. At year-end accounting mismatch

**Pain points:** Already covered in §7.1. **P0.**

---

## 24. Deliverable summary — the issues table

Every significant problem from this audit, in one place:

| ID | Problem | Priority | Area |
|---|---|---|---|
| 1.1 | Three overlapping candidate tables surface as one pipeline | P0 | Recruitment |
| 1.2 | 8-button requisition header | P1 | Recruitment |
| 1.3 | No per-requisition work log | P1 | Recruitment |
| 2.1 | Profile / Reach buttons confusing | P1 | Candidate |
| 2.2 | CV extraction isn't integrated into onboarding | P1 | Candidate |
| 2.3 | Pipeline cards visually weak | P2 | Candidate |
| 3.1 | Immigration case page crammed with info | P0 | Immigration |
| 3.2 | Beneficiary can't see what's outstanding | P1 | Immigration |
| 3.3 | No "what will I need" preview before opening case | P2 | Immigration |
| 4.1 | Employer onboarding is a dialog, not a flow | P0 | Company |
| 5.1 | Client context lost on requisition page | P1 | Running a req |
| 6.1 | Adverts invisible on employer/requisition records | P1 | Advertising |
| 6.2 | Advert payment not a first-class flow | P1 | Advertising |
| 7.1 | **Refund flow does not exist** | P0 | Finance |
| 7.2 | No per-invoice payment terms | P1 | Finance |
| 7.3 | No financial roll-up per record | P2 | Finance |
| 8.1 | VAT rate is global only (no per-service) | P2 | VAT |
| 8.2 | No "VAT disabled" mode | P1 | VAT |
| 8.3 | No per-employer VAT treatment | P1 | VAT |
| 9.1 | No employee onboarding workflow | P1 | HR |
| 9.2 | No employee detail page | P1 | HR |
| 9.3 | Employees scattered across workspaces | P2 | HR |
| 10.1 | Permission matrix overwhelming | P1 | Permissions |
| 10.2 | Role vs permissions drift invisible | P2 | Permissions |
| 11.1 | Clock in/out buried on /hr | P1 | Attendance |
| 12.1 | Dashboard is a stat board, not a workbench | P0 | Dashboard |
| 13 | Owner invisible on most record pages | P1 | My work |
| 14 | No per-requisition deliverables surface | P1 | Work tracking |
| 15 | See 2.2 | — | — |
| 16.1 | Workspaces are a hidden concept | P1 | IA |
| 16.2 | Candidates split across workspaces | P1 | IA |
| 16.3 | /admin lookup pages confusing | P2 | IA |
| 20 | No system-wide cognitive load rules | P1 | Behaviour |

Count: 6 × P0 · 15 × P1 · 7 × P2 · 1 × informational.

---

## 25. Proposed ideal information architecture

**Top-level sidebar (always visible, permission-filtered):**

```
Home                                  (/)
Recruitment
  ↳ Candidates                        (/people/candidates)
  ↳ Jobs                              (/recruitment/jobs)
  ↳ Clients                           (/clients)        [= employers]
  ↳ Enquiries                         (/recruitment/enquiries)
  ↳ Ads & campaigns                   (/recruitment/campaigns)
Immigration
  ↳ Cases                             (/immigration/cases)
  ↳ Case types                        (/immigration/types)
Finance
  ↳ Invoices                          (/finance/invoices)
  ↳ Payments                          (/finance/payments)
  ↳ Receipts                          (/finance/receipts)
  ↳ Refunds                           (/finance/refunds)        [NEW]
  ↳ Credit notes                      (/finance/credit-notes)
  ↳ VAT returns                       (/finance/vat)
People
  ↳ Employees                         (/people/employees)
  ↳ Candidates                        (/people/candidates)
  ↳ Attendance                        (/people/attendance)
Reports                               (/reports)
Settings                              (/settings)
  ↳ Business                          (/settings/business)
  ↳ Services                          (/settings/services)
  ↳ Document types                    (/settings/document-types)
  ↳ Users & permissions               (/settings/users)
  ↳ Audit log                         (/settings/audit)
  ↳ Advanced                          (/settings/advanced)
```

**Decisions:**
- **Candidates have ONE home** under People → Candidates. They SHOW UP in Recruitment screens contextually (e.g., on a requisition's pipeline), but their canonical URL is `/people/candidates/[id]`.
- **Workspaces are deleted.** Permissions handle access.
- **"Admin" is renamed "Settings"**.
- **Clock in/out moves to the shell topbar widget**.
- **Finance gets its own top-level section** — currently split between /engagements, /payments, /invoices under candidates/employers. Consolidate.
- **Enquiries** = current `/leads`. Owner has declined this rename but noting for completeness.

---

## 26. Ideal end-to-end workflow diagrams

Each workflow is a sequence of steps. Written as `Stage → trigger → next stage`.

### 26.1 Candidate onboarding

```
Create candidate (draft)
       ↓
Upload CV
       ↓
Extract fields (confidence-scored)
       ↓
Review & correct   ← split-screen
       ↓
Add service required  (which product are they buying?)
       ↓
Collect payment
       ↓
Issue invoice + receipt (auto)
       ↓
Finalise candidate (status = ACTIVE)
       ↓
Candidate appears in: Candidates list, matching for open requisitions
```

### 26.2 Company (client) onboarding

```
Create employer (draft)
       ↓
Basics (name, industry)
       ↓
Address
       ↓
Primary contact
       ↓
Billing info (invoice email, VAT ID, payment terms)
       ↓
Documents (conditional on services)
       ↓
Services needed (recruitment ✓ / immigration / advertising)
       ↓
Review & complete
       ↓
Employer appears in: Clients list; eligible for job creation
```

### 26.3 Employee onboarding

```
Create user (draft)
       ↓
Personal info
       ↓
Employment info (department, line manager, type)
       ↓
Access & permissions (role preset + preview)
       ↓
Documents (offer letter, signed contract)
       ↓
Payroll (bank, tax ID — optional at this stage)
       ↓
Review
       ↓
Send welcome email → employee activates account
```

### 26.4 Requisition / Job lifecycle

```
Create job (status: DRAFT)
       ↓
Define requirements (skills, qualifications, salary band)
       ↓
Open job (status: OPEN)
       ↓
Source candidates
   ├─ Run assisted matching          (algo scoring)
   ├─ Add from pool                  (manual)
   ├─ Add outsourced                 (partner)
   └─ Start advertisement            (campaign)
       ↓
Review & shortlist
       ↓
Schedule interviews
       ↓
Send offer
       ↓
Accept offer → Create placement + close job (if filled)
       ↓
Documentation + Immigration (parallel)
       ↓
Started / Completed
```

### 26.5 Immigration case

```
Open case (status: OPEN)
       ↓
Define required documents (pulled from case type)
       ↓
Request documents from beneficiary
       ↓
Documents received (status: DOCUMENTS_PENDING → each requirement MISSING → PROVIDED → ACCEPTED)
       ↓
Submit to authority (status: SUBMITTED, submittedAt set)
       ↓
Awaiting decision (status: UNDER_AUTHORITY_REVIEW, reminder set)
       ↓
Decision recorded (status: APPROVED or REJECTED, decisionAt set)
       ↓
Archive case (status: CLOSED)
```

### 26.6 Advert

```
Start advert (from job)
       ↓
Pick channel + budget
       ↓
Raise invoice to client
       ↓
Payment verified
       ↓
Advert goes LIVE
       ↓
Prospects respond → auto-flow into job's pipeline
       ↓
Advert completes (budget spent OR duration elapsed OR candidate placed)
```

### 26.7 Invoice → Payment → (Refund) → Credit note

```
Invoice issued (status: ISSUED)
       ↓
Payment recorded (status: PENDING)
       ↓
Payment verified (status: VERIFIED)
       ↓
Receipt auto-generated
       ↓
Invoice recomputed (status: PARTIALLY_PAID or PAID)

── OPTIONAL REFUND BRANCH ──
       ↓
Operator opens invoice → Refund button visible
       ↓
Refund dialog (which payment? amount? reason?)
       ↓
Refund recorded (new `refunds` row)
       ↓
Payment status → PARTIALLY_REFUNDED or REFUNDED
       ↓
Credit note auto-issued
       ↓
Invoice recomputed
```

### 26.8 Case assignment

```
Record created
       ↓
(Default) Assigned to the creator
       ↓
Reassign dialog opens
       ↓
Pick assignee + optional note
       ↓
Record updated
       ↓
Notification sent to assignee + task auto-created
       ↓
Audit event written
```

---

## 27. Duplicate functionality

| Pair | Currently | Recommendation | Why |
|---|---|---|---|
| **Profile vs Reach** (candidate card) | Two buttons meaning different things | Keep one (**Open**) | "Reach" is undefined to users |
| **Shortlists vs Matching** | Two near-identical pages | Merge: one `/recruitment/sourcing` page with "Suggested" (from matching) + "Shortlisted" (manual) sub-tabs | Separate pages solve a user problem that isn't there |
| **Leads vs Prospects vs Candidates (pre-conversion)** | Three concepts, three tables | Keep all three (they ARE distinct per agent report) but SIGNAL the distinction in UI: Leads = inquiries, Prospects = campaign responders, Candidates = active | Rename `/prospects` → `/recruitment/campaign-responses` to make purpose explicit |
| **Services engagement (menu) vs Billing section on records** | Two surfaces showing the same data | Keep both — the global list is for ops; the per-record view is for context. Add cross-links. | Different users, different needs |
| **Admin > Document types vs Admin > Document rules** | Two cards | Keep separate — types are "what kinds of docs exist", rules are "when do we need which doc" | Different concepts, correct separation |
| **Candidate info shown on candidate record vs on their application vs on their immigration case** | Three different views | Keep — each view is contextual. Audit panel labels for consistency. | Different operational contexts |
| **`/hr` self-service vs `/hr/admin` directory** | Two pages | Keep but merge the Attendance surfaces — `/hr/admin` shows team attendance; `/hr` shows mine | Role-dependent |
| **Notifications vs Tasks vs Reminders** | Three different "someone needs to do something" surfaces | Clarify: notifications = things that happened (read-only), tasks = things to do (with due dates), reminders = calendar nudges | Collapse reminders INTO tasks (they're the same thing with a date) |

---

## 28. Missing connections

Relationships the DB supports but the UI doesn't surface:

| Relationship | DB has it? | UI surfaces it? | Fix |
|---|---|---|---|
| Employer ↔ Advert | Via `campaigns.employerId` | ❌ No panel on employer | Add "Advertising" card to employer record |
| Advert ↔ Payment | ❌ No FK | ❌ No link | Add `advertisements.invoiceId` + show invoice state on advert |
| Payment ↔ Invoice | ✅ Via engagement join | ✅ Shown on invoice page | OK |
| Refund ↔ Credit note | ❌ Refunds don't exist | ❌ | Build refund flow (§7) |
| Employee ↔ Cases they own | ✅ Via `assignedUserId` | ⚠️ Visible only in reassign dialog | Add Owner chip to every record header + "My work" dashboard section |
| Employee ↔ Permissions | ✅ | ✅ Matrix editor | OK but intimidating (§10) |
| Employee ↔ Attendance history | ✅ Via `attendanceSessions.userId` | ⚠️ Visible only on `/hr/admin` | Add to employee detail page (new, §9.2) |
| Candidate ↔ Current pipeline position | ⚠️ Spread across 3 tables | ⚠️ Visible via Related work panel but confusingly | Single "Current activity" card on candidate record showing one line per active req |
| Candidate ↔ Documents needed for immigration | ✅ Via case requirements | ⚠️ Only visible inside the case | Add to candidate's Documents tab with a "Required for case: X" tag |

---

## 29. Phased implementation plan

### Phase 1 — Critical usability (6 weeks)
Target: a new hire can operate the system in one morning with no training.

- 7.1 Refund flow built end-to-end (schema + action + dialog + receipt updates)
- 4.1 Multi-step employer onboarding + draft employer
- 3.1 Immigration case page redesign (phased content area)
- 1.1 Pipeline wall collapses three tables into one visible journey
- 12.1 Dashboard redesign (My Work / Team Work split)
- 11.1 Clock-in widget in global shell

### Phase 2 — Workflow completion (4 weeks)
- 1.2 `<RecordHeaderActions>` primitive + apply across 4 record pages
- 1.3 Per-requisition work log + deliverables
- 2.2 CV extraction integrated into onboarding
- 6.1 / 6.2 Advert ↔ employer ↔ requisition surfaces + billing link
- 9.1 Multi-step employee onboarding

### Phase 3 — Financial completeness (3 weeks)
- 7.2 Per-invoice `dueAt` + employer-level payment terms
- 8.2 "VAT disabled" setting + conditional UI
- 8.3 Per-employer VAT treatment
- 7.3 Financial summary card per record

### Phase 4 — HR + attendance (2 weeks)
- 9.2 Employee detail page
- 10.1 Permissions UI with role-first + preview
- 13 Owner avatars + "My work" everywhere

### Phase 5 — Polish (ongoing)
- 2.3 Pipeline card visual pass
- 16 IA/nav refactor
- 17 Remaining terminology cleanup (if owner agrees)
- 20 Behavioural rules enforcement across new surfaces
- Mobile responsive pass

**Total engineering estimate: 15 weeks** for a sustained 2-engineer effort, or 8 weeks for a 4-engineer sprint.

---

## 30. The principle this document is written around

> **The user should not have to understand how the database is structured in order to understand how to use the business system.**

Every finding above traces back to a single question: *does this feature show the user a BUSINESS CONCEPT or a DATABASE CONCEPT?*

- "Requisition" is DB-shaped. "Job" is business-shaped.
- "Shortlist entry" is DB-shaped. "Candidate presented to client" is business-shaped.
- "Service engagement" was DB-shaped. "Service" (Session 8) is business-shaped.
- "PENDING_PAYMENT" is DB-shaped. "Awaiting payment" is business-shaped.
- A page showing "status" alone is DB-shaped. A page showing "what you should do next" is business-shaped.

The data layer is excellent. The business layer is 60% there. The product can be world-class with the fixes above and no backend rewrite.

Ship Phase 1 first. Measure. Iterate.

---

*End of audit.*
