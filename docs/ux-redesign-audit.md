# Phase 1 Audit — Task-Based UX Redesign

**Status:** draft for review · **Owner:** product / UX work-stream · **Last updated:** 2026-10-07

This document is Phase 1 of the redesign brief (section 25 of the spec).
It audits the current application against the 29-section brief, catalogues
the real friction, and proposes a prioritised rollout. **No code changes
yet** — this is the plan the subsequent sessions execute against.

Audience: internal engineers, next-session Claude. Anyone picking this
up should be able to read the brief, read this audit, and know exactly
which workflow to redesign first and why.

---

## 1. Executive summary — the three biggest gaps

After walking the dashboard + the five main record pages (candidate,
employer, requisition, immigration case, lead) and the primary form
dialogs, three gaps dominate everything else:

### Gap 1 — There is no "Next Action" anywhere in the app

Every record page shows **current status** (via colored badges) and
offers a flat row of **what the user *could* do** (Edit / Assign /
Create X / Generate Y). None of them show **what the user *should* do
next.** The user has to look at the status, mentally compute "ah, so I
need to…", find the right button amongst 4–6 options, and click it.

This is the spec's central principle (sections 2, 3, 6, 19) and the
single highest-leverage change available. One component — a
"NextActionCard" — applied to candidate / employer / requisition /
immigration-case / lead will deliver 80 % of the brief's intent.

### Gap 2 — The dashboard is a status board, not a workbench

`/dashboard` shows "Attention needed" counts (overdue tasks, payments
awaiting verification, cases expiring) which drill down. That's good.
**What it doesn't do:**

- No Quick Actions row (section 13). The only CTA at the top is "Create
  Lead". New Candidate, New Company, New Requisition, New Immigration
  Case, Create Invoice, Add Reminder all require navigating into their
  section first.
- No "My Tasks & Next Actions" list in the spec's exact shape (section
  13 example: *"5 leads need invoices · 3 invoices are overdue · 2
  candidate services ready to start"*). The existing Attention panel
  comes close but is phrased in system terms rather than business
  task terms.

A business user opening the dashboard today sees numbers. They should
see a to-do list of things to click.

### Gap 3 — Important actions still hidden behind context tricks

Specific examples found in the walk:

- **Raise placement fee** on an employer only shows up when the URL
  carries `?raisePlacement=…`. If an operator lands on an employer page
  by any other route, there is no visible "raise placement" button.
- **Set reminder / update decision / close case** on an immigration case
  are not visible buttons. The user has to open Edit, change the
  relevant field, and save.
- **Mark requisition as filled** has no direct button; the user has to
  advance candidates through the pipeline until one lands in Placed.
- Several multi-step dialogs (lead creation, invoice creation) show
  every field at once rather than progressively disclosing per section
  18.

These are not consistent "hidden under ⋮" patterns — they're
one-offs. The redesign needs to make primary workflow actions visible
on the record page in all cases, not just when the URL cooperates.

---

## 2. Per-section audit — what the brief asks for vs what exists

The table maps each prescriptive section of the brief to what the current
app does. "✅" = already satisfies the brief; "⚠️" = partially;
"❌" = missing.

### §2 Task-based, not database-based

| Signal | State |
|---|---|
| Primary nav organised by workspace (Candidate Services / Recruitment / Immigration + Main) | ✅ already done per `redesign-plan.md` |
| Record pages structured around what the user does, not DB tables | ⚠️ structure is right; tabs are nouns (Overview / Applications / Documents) rather than workflow stages |
| "Candidate → Current Status → Next Action → Complete Action" rhythm | ❌ status is shown, next action is not |

### §3 The "What do I do next?" rule

Spec requires every important record to answer six questions:

| Question | Candidate page | Employer page | Requisition page | Immigration case page |
|---|---|---|---|---|
| Where am I? | ✅ breadcrumb | ✅ breadcrumb | ✅ breadcrumb | ✅ breadcrumb |
| What am I looking at? | ✅ title + role | ✅ title + role | ✅ title + role | ✅ title + role |
| What is the current status? | ✅ dual badge (availability + lifecycle) | ✅ relationship status | ✅ status + fill count | ✅ status |
| What has already been completed? | ⚠️ scattered across tabs | ⚠️ scattered across cards | ⚠️ fill count only | ⚠️ decision field |
| What needs to happen next? | ❌ | ❌ | ❌ | ❌ |
| What button to press to do it? | ❌ (flat 4-button row) | ❌ (flat 4-button row) | ❌ (flat 5-button row) | ❌ (flat 3-button row) |

### §4 Contextual actions

Spec's checklist of actions that should appear on each record page:

| Record | Required actions (section 4) | Present | Missing |
|---|---|---|---|
| Candidate | Create Lead, Create Invoice, Record Payment, Start Service, View Resume, Add to Recruitment, Create Immigration Case, View Documents, View History, Archive | Create Invoice (Billing tab), Create Immigration Case (header), View Documents (tab), View Activity (tab) | Create Lead, Record Payment (buried in billing), Start Service, Add to Recruitment, Archive |
| Company | Create Requisition, Create Advertisement, Add Reminder, Add Candidate, Create Immigration Case, Create Invoice, View Payments, View Recruitment, View Immigration, View Documents | New Requisition (header), Generate Invoice (header), Contacts card, Billing card | Create Advertisement, Add Reminder, Add Candidate, Create Immigration Case (!), View Immigration surface |
| Requisition | Edit Requisition, Start Advertisement, Add Reminder, Find Candidate, Add Outsourced Candidate, View Applicants, Update Status | Edit, Add candidate (header), Run matching (header), Pipeline tab | Start Advertisement, Add Reminder, Add Outsourced Candidate (distinction from internal unclear), Update Status (hidden in Edit) |

### §5 Progressive disclosure

| Signal | State |
|---|---|
| Frequently-used actions as visible buttons | ⚠️ Visible, but no hierarchy — all buttons same prominence |
| Less-used actions under a "More" menu | ❌ No "More" menus — buttons are flat and sometimes crowded |
| Never hide a primary workflow action in ⋮ | ✅ no ⋮ menus today — the opposite problem (too flat) |

### §6 "Next Action" component throughout

Required across: Leads, Candidates, Candidate Services, Invoices, Companies, Recruitment Requisitions, Advertisements, Recruitment Candidates, Reminders, Immigration Cases.

| Present on | None |
|---|---|

❌ **Zero coverage.** This is the single biggest build-time item in the
redesign.

### §11 One unified Lead system

Spec: one `[+ New Lead]` button, then user picks target business.

Current `CreateLeadDialog` already does exactly this — targetBusiness
is the first choice, form fields swap per branch (CS / Immigration /
Recruitment).

| Signal | State |
|---|---|
| Single new-lead entry point | ✅ |
| Dropdown picks lead type | ✅ |
| Only relevant fields shown | ✅ |
| Underlying DB relationships correct (lead → person vs lead → employer) | ✅ |

✅ **Already compliant with §11.** Minor polish only.

### §12 One unified Invoice experience

| Signal | State |
|---|---|
| `[+ Create Invoice]` on candidate | ✅ via GenerateInvoiceDialog on Billing tab |
| `[+ Create Invoice]` on employer | ✅ in header |
| `[+ Create Invoice]` on immigration case | ✅ visible card in sidebar |
| `[+ Create Invoice]` on requisition | ❌ not present; invoice goes via placement raise |
| `[+ Create Invoice]` on lead | ⚠️ raised at lead creation time but not after |
| Interface identical across divisions | ✅ one shared `GenerateInvoiceDialog` component |
| Supports amount / currency / tax / discount / due date / terms | ⚠️ no explicit discount or due date / terms fields in the current dialog |

### §13 Dashboard — Quick Actions

Spec's required row: `[+ New Lead] [+ New Candidate] [+ New Company] [+ New Requisition] [+ New Immigration Case] [+ Create Invoice] [+ Add Reminder]`

Current dashboard has: `[Create Lead]` only.

❌ **Six buttons missing.** This is a one-page edit that will deliver
immediate productivity gain.

### §13 Dashboard — My Tasks & Next Actions

Spec example lines: *"5 leads need invoices · 3 invoices are overdue · 2
candidate services are ready to start · 4 recruitment follow-ups are due
· 3 immigration cases need documents · 2 advertisements are expiring"*

Current dashboard has an "Attention needed" panel with overdue tasks,
payments awaiting verification, cases expiring, interview-stage
applicants. Shape is close; phrasing is in system terms ("payments
awaiting verification") not task terms ("3 payments to verify").

⚠️ Partial — rename + rephrase + add missing categories.

### §14 Dashboard — Summary cards

Spec: New Leads · Unpaid Invoices · Active Candidate Services · Open
Recruitment Requisitions · Active Advertisements · Upcoming Reminders ·
Overdue Reminders · Active Immigration Cases.

Current dashboard summary cards cover revenue, pipelines, aging,
service engagements. Overlap is partial; the brief wants simpler
to-do-shaped cards.

⚠️ Keep existing finance view behind a toggle; add the simpler
to-do-shaped row above it.

### §15 Navigation

Spec recommended structure: Dashboard · Leads · Candidates · Companies
· Candidate Services · Recruitment · Immigration · Invoices & Payments
· Reminders & Tasks · Reports · Settings.

Current structure (per `src/components/shell/nav-config.ts`): workspace
switcher (Main / Candidate Services / Recruitment / Immigration) + per-
workspace nav. Depth is similar; terminology is close.

⚠️ Minor relabelling — "Reminders & Tasks" instead of "Activities".

### §16 Record pages — consistent structure

Spec requires: Status / Next Action / Quick Info / Services / Related.

Current record pages have: breadcrumb / title / meta strip (status) /
flat action row / tabs for content.

❌ **No "Next Action" block anywhere.** Everything else is close enough
to pattern-match on.

### §17 Terminology — business language, not developer language

Spot check of current UI copy:

- ✅ "Candidate", "Lead", "Invoice", "Payment", "Requisition" — all
  business language
- ⚠️ "Service engagement" appears in the UI — this is a database-shaped
  term the user won't recognise; §17 would call it "candidate service"
- ⚠️ "Prospect", "Shortlist entry" — DB words; use "candidate" uniformly
- ✅ No "entity ID", "foreign key", "workflow object" in UI copy

### §18 Short, sectioned, smart forms

Current dialogs sampled:

| Dialog | Field count visible at once | Sectioned | Pre-fills from context |
|---|---|---|---|
| CreateLeadDialog | ~18 fields depending on branch | ⚠️ some grouping | ✅ branch toggles sub-form |
| GenerateInvoiceDialog | ~7 fields | ✅ | ✅ pre-fills from service picked |
| EmployerDialog | ~12 fields | ⚠️ one scroll | ⚠️ |
| RequisitionDialog | ~15 fields | ⚠️ | ✅ pre-fills employer |
| ImmigrationCaseDialog | ~10 fields | ⚠️ | ✅ pre-fills candidate |

❌ Most dialogs show every field at once with soft grouping. Collapse
to "Basic / Service / Additional" blocks per §18.

### §19 Smart workflow buttons (state-aware primary)

| Record | Current primary button | State-aware? |
|---|---|---|
| Candidate | Edit | ❌ same regardless of state |
| Employer | Edit | ❌ |
| Requisition | Edit | ❌ |
| Immigration case | Edit | ❌ |

❌ Zero coverage. §19 wants the primary button to morph: *Lead →
`[Create Invoice]` · Invoice Created → `[Record Payment]` · Paid →
`[Start Service]` · In Progress → `[Update Service]` · Completed →
`[Complete & Archive]`*. Combined with §6 (Next Action card), this is
the heart of the redesign.

### §20 Don't overuse dropdown menus

| Signal | State |
|---|---|
| Primary actions as visible buttons | ✅ |
| Dropdown menus hiding workflow actions | ❌ not a problem today |
| "More" menu for admin / infrequent actions | ❌ — but §5 wants one |

⚠️ Opposite problem: no "More" button means admin/infrequent actions
sit at same prominence as primary actions.

### §21 Visual status

Status badges exist (via `components/pipeline-chip.tsx`,
`lib/ui/status-tone.ts`) and are tone-mapped. Progress indicators exist
in a few places (requisition fill bar).

| Signal | State |
|---|---|
| Status labels present | ✅ |
| Visual progress indicator per workflow stage (dot steppers etc.) | ⚠️ only requisition fill has a bar |
| Consistent status terminology across workflows | ❌ "Availability" vs "Lifecycle" vs "Status" vs "Relationship status" |

### §22 Design for 40–45-year-old business users

- ✅ Large readable text, strong hierarchy on most pages
- ⚠️ Some icon-only buttons (⋮ ban icon on pipeline cards) need labels
- ✅ Clear buttons on primary surfaces
- ❌ No "simplified mode" / no onboarding tooltips
- ✅ Search is prominent

### §23 Visual design

Modern, clean, uses CSS vars + tailwind, consistent cards. No fancy
animations beyond `FadeUp`. No excessive colour. Overall ✅.

### §24 Preserve existing system

The spec repeatedly emphasises: do not rewrite backend, preserve data,
preserve business logic. The whole redesign is a UI refactor.

✅ The audit confirms the backend (schema, service layer, actions, API
routes) is a solid base. Zero backend changes needed for §2–§23.

### §26 Acceptance scenarios

Walking the three required scenarios against the current app:

**Scenario 1 — Candidate Service** (section 26):

| Step | Possible today? | Clicks needed |
|---|---|---|
| 1. Create a candidate lead | ✅ | 3 (dashboard → Create Lead → fill → save) |
| 2. Immediately understand what to do next | ❌ | user has to know "I need to raise an invoice now" |
| 3. Create an invoice without searching for the candidate again | ⚠️ | lead creation can issue invoice inline — good; but AFTER the lead, user navigates to candidate → Billing → Generate invoice (4 clicks) |
| 4. Enter the amount | ✅ | |
| 5. Record payment | ⚠️ | must find candidate → Billing → specific invoice → Record payment (5 clicks) |
| 6. Start the resume service | ❌ | no visible "Start service" button; user has to know the engagement advances via payment verification |
| 7. Complete the service | ❌ | no visible "Complete service" button |
| 8. Find the candidate later | ✅ | search works |

4 of 8 steps fail the "non-technical user" test.

**Scenario 2 — Recruitment** (section 26):

| Step | Possible today? | Pain |
|---|---|---|
| Add a company | ✅ | |
| Create a requisition | ✅ | |
| Start an advertisement | ⚠️ | advertisement is a separate module under campaigns, not a 1-click from requisition |
| Add a reminder | ❌ | no "reminder" primitive specifically for requisitions |
| See when the reminder is due | ❌ | |
| Find a candidate from existing list | ✅ | "Run matching" or "Add candidate" buttons |
| Add an outsourced candidate | ⚠️ | distinction between internal and external applicant isn't surfaced; the "Log external application" dialog on the candidate page is the closest equivalent |
| Track candidate through recruitment | ✅ | Pipeline wall |

3 of 8 steps fail.

**Scenario 3 — Immigration** (section 26):

| Step | Possible today? | Pain |
|---|---|---|
| Create own immigration case type | ✅ | `/admin/immigration-types` exists |
| Open an existing candidate | ✅ | |
| Start an immigration case from candidate | ✅ | header "Raise immigration case" |
| Open a company | ✅ | |
| Start an immigration case from company | ❌ | no visible button on employer page |
| Recruitment + immigration on same company | ⚠️ | both exist in schema; employer page shows requisitions but not immigration cases |
| Create an invoice | ✅ | |
| See next action required | ❌ | immigration case page shows status only |

4 of 8 steps fail.

---

## 3. Prioritised rollout — the sessions after this one

Each row below is one focused engineering session. Order is by business-
value-per-hour: the earlier sessions are the lowest-cost / highest-return
items.

### Session 2 — Next Action primitive + Candidate page (highest leverage)

Build the **NextActionCard** reusable component:

```
┌──────────────────────────────────────┐
│ CURRENT STATUS                       │
│ [status chip]                        │
│                                      │
│ NEXT ACTION                          │
│ [one-sentence business-language goal]│
│                                      │
│         [ Primary CTA  → ]           │
│                                      │
│     [secondary action] [tertiary]    │
└──────────────────────────────────────┘
```

- Lives at `src/components/next-action-card.tsx`
- Props: `status`, `statusTone`, `heading`, `description`, `primary`
  action (href or dialog trigger), optional `secondary` + `tertiary`
- Each caller supplies a server-side mapping from entity → state →
  next-action copy + CTA. The caller owns the state machine.

Apply it to the **Candidate record page first** (biggest single-page
business value). State machine per Scenario 1:

| Status | Next action copy | Primary CTA |
|---|---|---|
| Lead with no invoice | "Issue the first invoice to lock the service engagement." | `[+ Create Invoice]` |
| Invoice issued, unpaid | "Record the payment when it arrives on the bank." | `[Record Payment]` |
| Payment verified, service not started | "Start the resume service — the candidate is paid up." | `[Start Service]` |
| Service in progress | "Keep the service moving." | `[Update Progress]` (opens engagement advance dialog) |
| Service complete, unarchived | "Archive the engagement; candidate goes back into the pool." | `[Archive]` |

Leaves current tabs (Overview / Applications / Documents / Billing /
Activity) in place — the card just goes at the top of the page.

**Deliverable:** NextActionCard component + wired on Candidate page +
one unit test for the state→copy mapping. ~1 focused session.

### Session 3 — Next Action on Employer, Requisition, Immigration case, Lead

Same component, four more state machines:

- **Employer**: `No requisitions → New requisition` · `Open reqs, nobody
  placed → Add candidates` · `Candidate placed → Raise placement fee
  invoice` · `All reqs filled → Capture repeat business`
- **Requisition**: `Draft → Open requisition` · `Open, no candidates →
  Find candidates / Start ad` · `Candidates in pipeline → Advance
  through pipeline` · `Candidate at offer → Place` · `Filled → Close`
- **Immigration case**: `New → Request documents` · `Documents being
  gathered → Chase missing docs` · `Ready → Submit case` · `Submitted →
  Awaiting decision` · `Decision made → Record outcome` · `Approved →
  Archive case`
- **Lead**: `New → Follow up` · `Invoice attached → Chase payment` ·
  `Paid → Convert`

~1 session.

### Session 4 — Dashboard overhaul (Quick Actions + My Tasks)

Rebuild `/dashboard` to lead with:

1. **Quick Actions** row at top (7 buttons per §13)
2. **My Tasks & Next Actions** — rephrased from the current "Attention
   needed" panel, in task language ("5 leads need invoices" etc.)
3. Existing finance / revenue widgets drop below the fold (still
   present, less prominent)

~0.5 session.

### Session 5 — Make the missing actions visible

Specific one-off fixes catalogued in §1 Gap 3:

- Add "Raise placement fee invoice" button to employer header
  unconditionally (not only via query param)
- Add Set reminder / Update decision / Close case / Re-open case
  buttons on immigration case
- Add "Mark as filled / Close" button on requisition
- Add "Start advertisement" from requisition detail (link into
  `/campaigns` prefilled)
- Add "Start immigration case" button on employer detail

~0.5 session.

### Session 6 — Form progressive disclosure (§18)

Collapse each major dialog into labelled sections:

- EmployerDialog → "Basic info" (name/trading/email/phone) / "Address"
  (collapsed by default) / "Admin" (notes)
- RequisitionDialog → "Role" / "Compensation" / "Requirements"
- ImmigrationCaseDialog → "Case" / "Timeline" / "Notes"
- CreateLeadDialog → already sectioned by branch; polish the shared
  base

~0.5 session.

### Session 7 — Smart workflow buttons (§19)

The NextActionCard already gives the primary button state-awareness.
This session hunts down the *other* buttons that stayed static when
they shouldn't:

- Candidate page header's "Edit" stays. But add a state-aware primary
  that mirrors the NextActionCard CTA so the header is scannable
- Pipeline wall card buttons — "Mark Placed" when at offer stage
  already exists (Decline offer added via Tracey fix). Add explicit
  "Accept offer" that's clearer than "Mark Placed"
- Invoice detail page already has state-aware top banner (Void vs
  Credit note) — carry that pattern to other printable surfaces

~0.5 session.

### Session 8 — Terminology sweep (§17)

Find and replace developer-shaped terms with business language:

- `service engagement` → `candidate service`
- `prospect` / `shortlist entry` → `candidate` where surfaced to the
  user
- `rejection reason` → `reason for decline`
- Walk every empty-state message and swap system phrasing for
  task phrasing

~0.3 session.

### Session 9 — Status terminology unification (§21)

Pick ONE word for status across every record. Candidates currently
show both "Availability" and "Lifecycle" — collapse into a single
visible status with the other available in a hover. Employers show
"Relationship status" — rename to just "Status" with same tone.

~0.3 session.

### Session 10 — e2e sweep against the three Scenarios

Walk Scenarios 1-3 from §26 end-to-end after each of Sessions 2–9
lands. The passing criterion for each step is "can a non-technical
user do this in ≤ 3 clicks without the current status screen".

Fail → feed back into subsequent session.

Target: 7/8 steps pass per Scenario by end of Session 10.

---

## 4. Non-goals for the redesign work

To keep the sessions bounded, these stay out of scope:

- Backend changes (schema, service layer, actions, APIs). The audit
  confirms the current backend supports the task-based UX the brief
  requires. If a specific action is missing (e.g. a `startService`
  server action), add it — but **do not refactor** existing working
  services.
- Permission / role model changes. The current RBAC is right.
- Multi-language. English only for this round.
- Keyboard shortcuts, slash-commands, AI assistant. Scope creep.
- Design-token refresh. Current tailwind + shadcn primitives are fine.
- Mobile-specific redesign. Current pages work on mobile; the redesign
  improves desktop UX. Mobile polish rides along for free where
  possible, is not optimised separately.

---

## 5. Open questions for the owner before Session 2

Decisions I need from you before I write the NextActionCard component:

1. **Visual weight of the Next Action card.** Options: (a) full-width
   banner at the top of every record page (loud, hard to miss),
   (b) sidebar card on the right (persistent as the user scrolls),
   (c) inline above the first content card (quiet, blends in).
   Default pick: (a) — the brief's whole point is "don't make the user
   figure out where to go."
2. **State machine owner.** Each record's state → next-action mapping
   can live either (a) in the server-side read function (central,
   testable, auth-aware) or (b) in a client-side helper (fast, but
   can't check permissions). Default pick: (a). Means adding a small
   `nextAction` field to each read-service's return shape.
3. **Multiple candidate services on one candidate.** A single candidate
   can have Candidate Services AND Immigration AND be on a Recruitment
   pipeline at the same time. The NextActionCard needs to pick ONE
   primary next action — rules for which wins?
   Default pick: whichever has the most urgent SLA (overdue > due
   today > upcoming > open-ended).
4. **Candidate archive flow.** Section 8 says archive is a workflow
   step. Currently candidates can be archived via `archivedAt` but
   there's no visible "Archive candidate" surface. Add one — but
   confirm the archive semantics: hidden from matching? still visible
   in search? reactivatable?
5. **Advertisement module as section-9 citizen.** Spec section 9 wants
   `[+ Start Advertisement]` directly on requisitions. Current ad
   model lives under `/campaigns`. Options: embed a mini ad-create
   dialog on the requisition (duplicates logic), or link into
   `/campaigns?requisitionId=…` with the field pre-filled (reuses the
   full dialog). Default pick: link + prefill. Still a one-click
   experience from the requisition.

---

## 6. What this audit does not cover

- Specific accessibility (WCAG) gaps — presume we re-audit after each
  record-page redesign ships
- Analytics instrumentation — redesign work should surface the
  anonymous usage metrics the owner will need to measure success
- Mobile-specific friction (mentioned above as non-goal)
- Content / copy writing — the brief wants business language; writing
  the exact strings for every state is Session-2+ work, not audit
  work
