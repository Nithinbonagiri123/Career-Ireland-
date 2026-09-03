# Career Ireland CRM — Quickstart

A 5-minute guide covering the workflows you'll use every day.

---

## 1. Sign in

Go to `https://your-domain/login` → enter your email + password.

You'll be signed out of every device if you change your password.

**Password rules** (enforced when you set or change one):
- 12+ characters
- At least 3 of: lowercase, uppercase, digits, symbols
- No common weak passwords ("password", "welcome", etc.)
- Can't contain your name or email

---

## 2. Find anything fast

Press **⌘K** (Mac) or **Ctrl+K** (Windows) anywhere in the app. A search box opens.

Type 2+ characters of a name (candidate, employer, requisition, immigration case)
→ arrow keys to navigate → **Enter** to open.

---

## 3. From candidate lead to placement (the golden path)

### Step 3.1 — Create a lead
**Leads → New lead** → fill in the person's details (name, email, phone, source) → **Save**.

### Step 3.2 — Convert to candidate
On the lead row → **⋯** (three-dot menu) → **Convert to candidate…**
- Upload the payment proof (PDF / PNG / Word) — the CRM records method as
  `PAYMENT_VERIFIED` and stores the proof against the candidate
- OR skip the upload — method becomes `MANUAL_OVERRIDE` (still audited)
- Enter a reason (min 3 chars) → **Convert**

The candidate now appears in **Candidates**.

### Step 3.3 — Complete the candidate's profile
Click the candidate's row → detail page. Add:
- **Skills** — pick from the seeded skill list, set proficiency + years
- **Qualifications** — certifications with institution + reference number
- **Employment history** — prior jobs with start/end dates
- **CV** — upload their CV via the Documents section
- **Email account** — set up their shared email (encrypted at rest, reveal-password is audited)

### Step 3.4 — Match to a requisition
**Requisitions → New requisition** → fill in the job, then on the detail page:
- Add **required skills** (with weights) and **required qualifications**
- Click **Run assisted matching** → candidates scored against the requirements
- Click **Why?** on any match to see the score breakdown
- **Shortlist** the good matches

### Step 3.5 — Move through the funnel
On a shortlisted candidate → **Promote to application** → pick the CV to submit.

On the application detail page (`/applications/[id]`):
- **Schedule interview** — date, mode (Video/Phone/In-person), interviewer names
- After the interview → **Passed** / **Failed** / **No-show** on the row
- **Draft offer** → set amount, currency, start date → **Send**
- When the candidate replies → **Accepted** / **Rejected** / **Negotiating**

Accepting an offer **automatically creates a placement** in PROPOSED status.

### Step 3.6 — Confirm the placement
**Placements** → find the auto-created PROPOSED row → **Confirm** → the candidate's
availability flips to PLACED and the requisition's fill count goes up.

---

## 4. Immigration cases

**Immigration → Open case** → pick the beneficiary + case type (Work Permit / Visa /
Extension) → Save.

On the case detail page:
- **Case documents** — add the required doc types for this case, upload files or
  attach docs already on the beneficiary's profile (e.g. passport re-used across cases)
- **Tasks** — auto-generated on case creation and every status change:
  - **OPEN**: "Confirm required documents with beneficiary" (2d)
  - **DOCUMENTS_PENDING**: "Chase missing documents" (5d) + "Prepare submission" (14d)
  - **SUBMITTED**: "Follow up with authority" (21d)
  - **APPROVED**: "Notify beneficiary + confirm start date" (2d)
  - **REJECTED**: "Review rejection + advise appeal path" (3d)
- **Expiry reminder** — if you set an `expires_on`, a "Case expires soon" task is
  created due 30 days before expiry

Change status via the status dropdown. State machine rejects invalid moves
(e.g. can't go CLOSED → OPEN).

---

## 5. Track who's doing what

### Assign a candidate / lead / requisition / employer / case to yourself
On any detail page → **Assign to me** in the header (or **Unassign**).
On the leads list → **⋯** → **Assign to me**.

### Filter to your work
Every list page (`/candidates`, `/leads`, `/requisitions`, `/employers`,
`/immigration`) has an **All / Assigned to me / Unassigned** filter chip
in the header. The choice persists in the URL — bookmark it if you like.

### Bulk-assign candidates
On **Candidates** → tick the row checkboxes → floating action bar appears
at the bottom → **Assign** → pick a user → **Assign**. All selected candidates
updated in one go (cap: 200).

---

## 6. Interviews at a glance

**Recruitment → Interviews** shows every scheduled interview grouped by day:
Today, Tomorrow, Later this week, Next week, Later.

Click any row → jumps to the application to log the outcome.

---

## 7. Reports + CSV exports

**Activities → Reports** → 5 pre-built reports with configurable date window
(7 / 30 / 90 / 365 days):

- **Application funnel** — where candidates drop off
- **Recruiter activity** — per-staff actions from the audit log
- **Requisition performance** — fill rate, applications, matches, age
- **Placements** — the full list with salary snapshots
- **Revenue** — verified payments by currency + service

Every report has a **CSV** button that respects the current date window.

---

## 8. Dashboard — "act on this now"

**Dashboard** → scroll to the "Act on this now" section. Four widgets, each row
is clickable:
- **Requisitions to fill** — open + partially-filled positions
- **Interviews this week** — jump straight to the application
- **Overdue tasks** — flagged in red
- **Cases expiring soon** — visa / permit renewals in the next 60 days

---

## 9. Getting help

- **Audit log** — every mutation is recorded. Ask your admin to check `/admin/audit`
  if you're unsure what happened to a record.
- **Notifications** — the bell icon in the top bar shows unread alerts (expiring
  documents, expiring cases, overdue tasks).
- **Reset password** — Account → Security. You'll be signed out on every device.

---

## What this CRM doesn't do (yet)

Setting expectations up-front:

1. **Read candidate email inboxes** — the CRM stores the shared email account
   credentials, but there's no in-CRM inbox view. Log in to Gmail / Outlook
   directly for now.
2. **Auto-parse CVs** — CVs are uploaded but skills are entered manually.
3. **Post to external job boards** — jobs on IrishJobs / Indeed / JobsIreland are
   posted on those sites directly; applications from those boards are logged
   here as "external applications".
4. **Send outbound emails / SMS to candidates** — all notifications are internal
   (in-app only).

These are on the roadmap but not in v1.
