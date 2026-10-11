# Phase 2 UX Audit — Fresh walk after Sessions 2–12

**Status:** draft for review · **Owner:** product / UX work-stream · **Last updated:** 2026-10-08

Written for: internal engineers + whoever picks up the next UX sprint.

This audit walks the whole app from scratch — not the Session-10
scenario sweep (which only tested the brief's §26 flows) but every
major surface: 22 list pages + 4 record detail pages + the printable
and admin surfaces. The lens is **taste + usability**, not the
original 29-section brief.

Sessions 2–12 moved the needle on task-based UX. This audit catches
what *still looks and feels off* after that work, independent of what
the brief asked for.

---

## 1. The three biggest problems that cross every page

### Gap A — The decorative background bleed

**Severity: HIGH.** Every single list page and most detail pages
render against a translucent, blurry decorative image of a camera /
binoculars / megaphone / stopwatch. On empty screens the image shows
through at ~30% opacity; on dense screens it still bleeds between the
cards.

The effect is that the whole app looks half-finished, as if the page
is still loading or a modal is open. The user's exact words from
Session 2's refactor message: *"the UI/design has to look good not
like a shit"* — this bleed is the main thing undermining the
otherwise-restrained design we built in Sessions 2–12.

Where it shows up: dashboard, candidates list (grid), requisitions
list (grid), employers list, immigration list, services list,
payments list, documents, campaigns, communications, interviews,
shortlists, matching, prospects, tasks, reports, HR, notifications,
account/security — basically everywhere.

**Fix:** find the global aurora/dot-pattern/grid-background component
(we have `aurora-background.tsx`, `dot-pattern.tsx`, `grid-background.tsx`
in `src/components/ui/`) and either remove it from inside the main
content area or clamp it to the login/auth routes only. The app shell
should carry one neutral background (card tone or app-bg), not a
decorative illustration.

### Gap B — Action-row dump on record pages

**Severity: HIGH.** The requisition detail page now shows 8 header
buttons:

```
[Assign to me] [Reassign] [Edit] [Add candidate] [Add outsourced]
[Run assisted matching] [Start advertisement] [Set reminder]
                                                [Close requisition]
```

Sessions 2–12 added each of these for a good reason. Together they
read as a toolbar, not as a set of decisions. The employer page is
similar: 5 buttons, Candidate is 4. The eye has nowhere to land.

**Fix:** split into primary / secondary / overflow:

- Primary: the state-aware filled verb we introduced in Session 7
  (Candidate already has this — extend to Employer, Requisition,
  Immigration).
- Secondary (visible): the 2–3 verbs most often used in current
  state. For a FILLED requisition: `Close requisition` + `Set
  reminder`. For an OPEN one with candidates: `Add candidate` +
  `Add outsourced`.
- Overflow (⋮ menu): everything else — Edit, Assign, Reassign,
  Run matching, Start advertisement.

Takes one shared `<RecordHeaderActions>` component with
`primary` / `secondary[]` / `overflow[]` slots. Cost: one small
primitive + four one-time refactors per record page.

### Gap C — Shortlists and Matching look identical

**Severity: MEDIUM.** `/shortlists` and `/matching` render the same
two-column grid of requisition tiles, with the same labels and the
same action affordances. A user who lands on one has no way to tell
which page they're on except the heading at the top-left.

The underlying flows are distinct:
- Matching = algorithm scores candidates against open reqs
- Shortlists = humans curate the top-N they want to pursue

**Fix:** differentiate visually and functionally. Options:
- Matching page gets a `[Run matching]` CTA per req; Shortlists gets
  a `[Promote all to apply]` CTA
- Matching shows the top 5 scored candidates per req as pills under
  each tile; Shortlists shows the shortlisted names
- Different colour accents on the tiles

Right now they're siblings-by-copy. Either make them meaningfully
different, or merge them.

---

## 2. Per-surface findings

### §2.1 Dashboard (`/dashboard`)

| Signal | State | Notes |
|---|---|---|
| Quick Actions row | ✅ | Session 4 shipped — 1 primary + 6 outlined, clean rhythm |
| "What needs doing" eyebrow + 4 cards | ✅ | Session 4 rename landed |
| Finance / Revenue section | ⚠️ | Washed out below the fold. May be a loading state captured in the screenshot; if not, visual contrast is too low |
| 30-day trends | ⚠️ | Three mini-charts side by side; take second place to Revenue which already has pie + line charts. Possible duplication of information surface |
| Operational pipelines (4 PipelineFunnel) | ✅ | Clear, useful |
| Decorative background | ❌ | Gap A — bleeds behind every card |

### §2.2 Candidates list (`/candidates`, grid view)

| Signal | State | Notes |
|---|---|---|
| Status chips after Session 9 | ✅ | One chip per candidate |
| Grid tile design | ⚠️ | Sticky-note green `profile` + pink `reach` footer buttons feel toy-like next to the restrained chips in the body. Taste call: the colour palette is louder than the rest of the app. Consider a single quiet footer button or two outlined ones |
| Top filters (Pipeline / Browse / All) | ✅ | Reads well |
| Decorative background | ❌ | Gap A |

### §2.3 Candidate detail (`/candidates/[id]`)

| Signal | State | Notes |
|---|---|---|
| Header meta strip (status + occupation + location) | ✅ | Session 9 unified |
| State-aware filled primary (Session 7) | ✅ | Fires when NextAction exists |
| 5-button action row | ⚠️ | On this screenshot the candidate has no NextAction (so no filled primary) and the row still has Edit · Raise immigration case · Unassign · Reassign — 4 buttons. Not terrible but Gap B applies when all five show at once |
| NextActionCard | ✅ | Renders when state fires it |
| Profile card | ✅ | Session 9 collapsed Availability + Lifecycle |
| Related work / Immigration cases / CV suggestions panels | ✅ | Good density |

### §2.4 Employer detail (`/employers/[id]`)

| Signal | State | Notes |
|---|---|---|
| Header action row | ❌ | 5 buttons visible (Unassign · Edit · Generate invoice · Start immigration case · + New requisition). Prime example of Gap B. "+ Raise placement fee" conditional makes it 6 on real data |
| NextActionCard | ✅ | Session 3 state machine |
| Contacts panel | ✅ | Clear |
| Requisitions panel | ✅ | Clean |
| Immigration cases panel (Session 11) | ✅ | Mounted, reads consistently with the candidate-side one |
| Billing section + notes | ✅ | — |

### §2.5 Requisition detail (`/requisitions/[id]`)

| Signal | State | Notes |
|---|---|---|
| **8-button header** | ❌ | Worst instance of Gap B in the app. Needs the `<RecordHeaderActions>` refactor |
| NextActionCard | ✅ | Session 3 state machine |
| Pipeline wall (Shortlist / Review etc. with Dismiss/advance verbs) | ✅ | Reads well; Session 7 renamed Mark Placed → Accept offer |
| Placements & fees section | ✅ | Visible further down |

### §2.6 Immigration case detail (`/immigration/[id]`)

| Signal | State | Notes |
|---|---|---|
| 4-button header | ✅ | Within the acceptable band — Assign to me, Reassign, Set reminder, Archive case. State-exclusive buttons (Approved / Rejected / Close) only appear in their own state |
| NextActionCard | ✅ | Session 3 state machine, state-aware |
| Case details card | ✅ | Status / Type / Submitted / Expires / Reminder / Opened — clear |
| Related work / Beneficiary / Sponsor panels | ✅ | Good |
| Billing for this case | ✅ | — |

### §2.7 Leads list (`/leads`)

| Signal | State | Notes |
|---|---|---|
| Table layout | ✅ | Dense but readable |
| Status column | ⚠️ | Mix of NEW (blue), Pending payment (yellow), Interested (green), Converted (dark), CONTACT (purple) — too many colours in one glance. Status palette inflation |
| Per-row actions | ⚠️ | `Assign to me` + `Convert` on every row — two filled-weight buttons per row is a lot of pixels. Promote one (Convert) and demote the other (Assign to me → smaller / ghost) |

### §2.8 Immigration list (`/immigration`)

| Signal | State | Notes |
|---|---|---|
| Card view | ✅ | 2 cards shown; density OK for small volume |
| Status chips + owner info | ✅ | — |
| Table toggle | ✅ | Standard "Cards / Table" switch |

### §2.9 Services (`/engagements`)

| Signal | State | Notes |
|---|---|---|
| Session 8 rename landed | ✅ | Nav + page title + CTA all read "Services" |
| Status column | ⚠️ | PENDING_PAYMENT and ACTIVE badges but it's hard to read PENDING_PAYMENT; could be `Pending payment` (space, title case) |
| Start service button lives in the row dropdown (Session 11) | ⚠️ | Discoverable only via `⋮` — the audit §19 recommendation was to make primary workflow verbs visible, not hidden under dropdown. Consider inline for the state the row is in |

### §2.10 Payments (`/payments`)

| Signal | State | Notes |
|---|---|---|
| Table layout | ✅ | Dense, clear |
| Status column | ✅ | All "verified" green badges — reads cleanly |
| Record payment button | ✅ | Session 11-era wording |

### §2.11 Documents (`/documents`)

| Signal | State | Notes |
|---|---|---|
| Tile grid | ⚠️ | Each tile just shows a person name + a doc icon. No doc type, no date, no size, no status. If this is the "documents hub" promised in the brief, the information scent is thin |
| Filter chips at top | — | Not visible in viewport capture |

### §2.12 Placements (`/placements`)

| Signal | State | Notes |
|---|---|---|
| Table layout | ✅ | Candidate · Employer · Salary · Status · Fee invoice · Start · Created |
| "Not raised" chip | ❌ | Rendered in alarming red/orange when it just means "no invoice yet". A placement with "Not raised" is a *neutral* state (expected default), not a *problem* state. Should be `neutral` tone or just plain text with a small outlined badge |

### §2.13 Shortlists + Matching

Covered in Gap C. They are the single clearest "fix me" item outside
the three cross-cutting gaps.

### §2.14 Prospects (`/prospects`)

| Signal | State | Notes |
|---|---|---|
| Empty state | ✅ | Reads task-y: "Prospects are recorded from an advertisement's intake dialog on the campaign detail page." |
| Filter row (status + country + search) | ✅ | — |

### §2.15 Tasks (`/tasks`)

| Signal | State | Notes |
|---|---|---|
| Table | ✅ | Shows 2 real tasks with Assignee / Priority / Status / Due / Created |
| New task CTA | ✅ | Visible |
| Decorative background | ❌ | Gap A |

### §2.16 Campaigns (`/campaigns`)

| Signal | State | Notes |
|---|---|---|
| Table (Campaign · Status · Started · Created · Open) | ✅ | Clean |
| "+ New campaign" + Session 5 deep-link support | ✅ | Shipped |

### §2.17 Communications (`/communications`)

Empty state only visible. Reads fine ("No communications logged yet…
attached to the person, employer, requisition, service, or case").

### §2.18 Interviews (`/interviews`)

Two interview rows visible. Compact candidate name + requisition
title + employer + interviewer badge. Reads fine.

### §2.19 Reports (`/reports`)

| Signal | State | Notes |
|---|---|---|
| Application funnel bar | ✅ | Clean |
| Recruiter activity | ✅ | — |
| Requisition performance | ✅ | — |
| No obvious gaps | — | — |

### §2.20 HR (`/hr`)

| Signal | State | Notes |
|---|---|---|
| "Attendance" page title | ✅ | Human-y, matches §17 renames |
| Clock in / out card | ✅ | — |
| Recent sessions list | ✅ | — |

### §2.21 Admin (`/admin`)

| Signal | State | Notes |
|---|---|---|
| Index-card layout grouped by concern (Access / Reference data / Commerce / Company) | ✅ | Reads like a well-organised control panel |
| No obvious gaps | — | — |

### §2.22 Notifications + Security

Both clean minimal single-purpose surfaces. No findings.

---

## 3. Prioritised fix list

Each is a bounded engineering session (0.3–1.0 sessions) with the
expected taste improvement. In order of impact.

### Session 13 — Kill the decorative background (Gap A)

**Effort: 0.3 session.**

- Find the global background component mounted in the app shell /
  `(app)/layout.tsx`.
- Either remove entirely or clamp to `/login` + `/login/*` routes.
- Replace with the plain app-bg / card tone the design system expects.

Impact: the single biggest "it looks good now" win available.

### Session 14 — Record-page action-row refactor (Gap B)

**Effort: 1.0 session.**

- Build `<RecordHeaderActions primary secondary[] overflow[] />` primitive.
- Apply to Candidate, Employer, Requisition, Immigration case headers.
- Routes each verb into primary / secondary / overflow by current state.

Impact: the record pages stop reading like toolbars; the primary verb
pops; secondary verbs are still one click away.

### Session 15 — Shortlists vs Matching (Gap C)

**Effort: 0.5 session.**

- Pick a direction (differentiate or merge) with the owner.
- If differentiate: shortlists lists shortlisted names per req;
  matching lists scored candidates per req. Each row has its own CTA.
- If merge: `/shortlists` 301s to `/matching?view=shortlisted` and the
  Shortlists page is deleted.

### Session 16 — Smaller polish items

**Effort: 0.5 session total.**

- **Placements "Not raised" tone** → `neutral`, not warning (Gap §2.12)
- **Leads status palette inflation** → consolidate colours; downplay
  the per-row Convert / Assign to me buttons (§2.7)
- **Services PENDING_PAYMENT label** → "Pending payment" (§2.9)
- **Services row dropdown Start verb** → promote to inline button for
  the state the row is in (§2.9)
- **Documents tile information** → add type + date + a status chip to
  each tile (§2.11)

### Session 17 — Dashboard polish

**Effort: 0.3 session.**

- Finance / Revenue section contrast (§2.1)
- Decide whether 30-day trends row and Revenue section are duplicative;
  possibly fold one into the other

---

## 4. What this audit does NOT cover

- Accessibility (WCAG) deep dive — defer to a dedicated a11y pass
- Mobile viewport review — all screenshots taken at 1500×1000; mobile
  needs its own walk
- Dialog + form interior audit — Session 6 touched the big three
  dialogs; dozens of smaller dialogs (archive prompts, record payment,
  bulk actions) haven't been systematically reviewed
- Dark mode — not toggled during this walk
- Error / failure states — not reproducible without seeded data

---

## 5. Scorecard

Against the audit's taste rubric (hierarchy, restraint, specificity,
negative space, consistency, task-focus, information scent):

| Dimension | Grade | Notes |
|---|---|---|
| Hierarchy | B | Record pages suffer Gap B; dashboard is clean |
| Restraint | C+ | Gap A drags this down; grid-view candidate cards too colourful |
| Specificity | A | Session 8 terminology sweep + Session 9 status unification showed up here — language reads as a human wrote it |
| Negative space | B+ | Mostly good; dashboard washout brings it down |
| Consistency | B | Shortlists/Matching duplication (Gap C) + per-page status palettes |
| Task-focus | A- | Sessions 2–12 landed this well — NextActionCard, state-aware verbs, quiet-row primitive are all working |
| Information scent | B+ | Documents hub is weakest; everything else at B+ or above |

**Overall: B+**, with a clear path to A- via Sessions 13 + 14. The
underlying design system is good; the three cross-cutting gaps are
pulling it down.
