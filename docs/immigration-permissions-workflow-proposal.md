# Immigration: permissions, status workflow and Activities access — proposal

Status: **proposal for approval — nothing here is implemented.** Prepared
during the Immigration Stage 6G visual redesign (October 2026). The visual
phase deliberately keeps today's behaviour; these three matrices are for
separate, later phases.

Permission model reference: `src/lib/auth/permissions.ts` — businesses
`main`, `candidate_services`, `recruitment`, `immigration`; Immigration
modules `dashboard`, `leads`, `cases`, `activities`; verbs cascade
`manage > delete > edit > create > view`. ADMIN and the business owner hold
everything. Finance authority (`src/lib/auth/finance-policy-rules.ts`):
ISSUE / VERIFY / REVERSE = active ADMIN or FINANCE, or an active owner on an
internal role.

---

## 1. Immigration permission matrix (server-side target)

Today every function in `src/modules/immigration/service.ts` checks only
`requireInternalStaff()`, and `/immigration/[id]` has no module check, so any
internal staff member can read and change any case.

| Operation | Service function(s) | Today | Proposed check |
|---|---|---|---|
| List cases | `fetchCases` | staff | `immigration.cases.view` (page already checks this) |
| Open a case page, read details | `fetchCase`, case page | staff | `immigration.cases.view` |
| Read requirements / documents / case tasks | `listCaseDocumentRequirements`, `listCaseDocuments`, `fetchTasksForImmigrationCase` | staff | `immigration.cases.view` |
| Cases for a person / employer (panels) | `listCasesForPerson`, `listCasesForEmployer` | staff | `immigration.cases.view`; the Employer page hides the panel when the viewer lacks it |
| Create a case | `upsertCase` (new) | staff | `immigration.cases.create` |
| Edit case fields | `upsertCase` (existing) | staff | `immigration.cases.edit` |
| Change status (incl. decision, close) | `updateCaseStatus` | staff + transition rules + close balance guard | `immigration.cases.edit` + unchanged rules and guard |
| Set reminder | `setCaseReminder` | staff | `immigration.cases.edit` |
| Add / update document requirement | `addCaseDocumentRequirement`, `updateCaseDocumentRequirement` | staff | `immigration.cases.edit` |
| Remove document requirement | `removeCaseDocumentRequirement` | staff | `immigration.cases.edit` (or `delete` — decision) |
| Attach / detach document | `attachDocumentToCase`, `detachDocumentFromCase` | staff | `immigration.cases.edit` |
| Archive / restore case | `archiveCase`, `unarchiveCase` | staff (audited reason) | `immigration.cases.delete` |
| Assign / reassign | assignment actions | owner-only reassign | unchanged |
| Raise invoice for a case | `generateInvoiceForPayer` | finance ISSUE (server) | unchanged server rule; **UI**: show the button only to finance-ISSUE holders, otherwise a disabled button explaining why |
| Record + verify a payment on a case | `BillingSection` → record dialog | `canVerify={false}` for everyone (UI); finance VERIFY (server) | unchanged until decided (see §4) |
| Immigration dashboard | page | `immigration.dashboard.view` | unchanged |

**Effect on preset roles if approved:** ADMIN / owner — no change. MANAGER
(view/create/edit) — loses archive (needs delete). DOCUMENT_SPECIALIST
(cases view/create/edit) — loses archive. FINANCE (cases view only) — can no
longer change status, reminders, documents or archive (it can today).
RECRUITER and STAFF without grants — can no longer open case pages by link;
the Employer page's Immigration panel is hidden for them.

---

## 2. Status transition matrix

Statuses: Open, Documents pending, Submitted, Under authority review,
Approved, Rejected, Closed. Rules: `IMMIGRATION_CASE_TRANSITIONS` in
`src/lib/state-machine.ts` (enforced in `updateCaseStatus`; closing is also
refused while an invoice balance is outstanding). `submittedAt` and
`decisionAt` are stamped automatically on the first Submitted / decision.

| From → To | Allowed by rules? | UI action today | Result today | Proposed action |
|---|---|---|---|---|
| (new) → Open | — | Create dialog with any status | works, but the dialog can also create Approved / Closed etc., bypassing the rules, the close guard and status tasks | **Always start Open**; remove the status choice from create |
| Open → Documents pending | yes | none | unreachable | "Request documents" |
| Open → Submitted | yes | none | unreachable | "Mark submitted" |
| Documents pending → Submitted | yes | none | unreachable | "Mark submitted" |
| Documents pending → Open | yes | none | unreachable | none (keep rule; no button) — decision |
| Submitted → Under authority review | yes | none | unreachable | "Mark under review" |
| Submitted → Approved / Rejected | **no** | Approve / Reject buttons shown | **always fails** with a rule error | hide on Submitted |
| Submitted → Documents pending | yes | none | unreachable | "Back to documents" |
| Under review → Approved | yes | Approve | works | keep (+ prompt for expiry date — decision) |
| Under review → Rejected | yes | Reject | works | keep |
| Under review → Documents pending | yes | none | unreachable | "Back to documents" |
| Rejected → Submitted (appeal / resubmit) | yes | none | unreachable | "Resubmit" |
| Approved / Rejected → Closed | yes | Close | works (balance guard) | keep |
| Open / Documents pending / Submitted / Under review → Closed | yes | none | unreachable | "Close case" (withdrawn) — decision |
| Closed → anything | no (terminal) | none | — | unchanged |

Also: Approve / Reject / Close currently use browser confirm pop-ups; the
proposal uses the app's dialogs, and Close explains the outstanding balance
before it is attempted.

---

## 3. Activities (`/tasks`) access matrix

Today `/tasks` requires `immigration.activities.view`, but it is linked from
the main dashboard, My work, drill-downs, quick actions and notifications for
every module, so Recruitment and Candidate Services users can be refused. It
lists **every** task, and task changes (`createTask`, `updateTaskStatus`,
`updateTask`, `archiveTask` in `src/modules/activities/service.ts`) only
check `requireInternalStaff()`.

A task can link to one record: person, employer, job requisition, service
engagement, immigration case or advertisement (or none).

**Page access (proposed):** any of `main.activities.view`,
`immigration.activities.view`, or view on any module whose records a task can
link to (below).

**Which tasks a user sees (proposed):**

| Task linked to | Visible when the user has |
|---|---|
| Assigned to me, or created by me | always |
| Immigration case | `immigration.cases.view` |
| Job requisition | `recruitment.requisitions.view` |
| Advertisement | `recruitment.campaigns.view` |
| Employer | `recruitment.employers.view` |
| Service engagement | `candidate_services.engagements.view` |
| Person | `candidate_services.candidates.view` or `recruitment.employers.view`… — decision (a person can be in both businesses) |
| Nothing linked | assignee / creator only, plus ADMIN / owner / `main.activities.view` |

**Which tasks a user can change (proposed):**

| Action | Allowed when |
|---|---|
| Create | `create` on the linked record's module (or `main.activities.create` for unlinked) |
| Start / done / edit | assignee, creator, or `edit` on the linked record's module |
| Archive (audited reason) | `delete` on the linked record's module, `main.activities.delete`, ADMIN or owner |

Nothing is broadened until this matrix is approved.

---

## 4. Billing authorisation notes (documentation only)

- **Raise invoice for this case** → `generateInvoiceForPayer` →
  `requireFinanceAuthority('ISSUE')`: active ADMIN or FINANCE, or an active
  owner on an internal role. Others see the button today and get an error.
- **Record + verify** (record-payment dialog inside the case billing list)
  → VERIFY tier: the same holders. The case page passes `canVerify={false}`,
  so nobody can verify from a case; payments recorded there stay pending
  until verified on Payments or the client workspace. Changing this is a
  product decision, not part of the visual phase.
- Invoice / receipt links on a case pointed to `/clients/<id>/invoices/…`,
  which does not exist. They now follow the payer: a person payer goes to
  `/candidates/<id>/invoices|receipts/…`, an employer payer to
  `/employers/<id>/invoices|receipts/…`, and a document with no payer shows
  no link (fixed in the visual phase as broken navigation).
