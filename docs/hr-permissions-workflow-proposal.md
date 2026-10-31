# HR: permissions, time rules and correction policy — proposal

Status: **proposal only — nothing in sections 1–4 is implemented.** Prepared
during the HR Stage 6G work (31 October 2026). The HR visual phase (H1–H3)
keeps today's behaviour; each section below needs its own approval.

The HR privacy fix (S-HR1) is the only HR behaviour change made so far; it
is described at the end for reference.

Permission model reference: `src/lib/auth/permissions.ts` (module
`hr_board` under `main`; verbs cascade `manage > delete > edit > create >
view`; ADMIN and the owner hold everything; the MANAGER preset holds
view/create/edit everywhere, so it includes `hr_board`; FINANCE, STAFF,
RECRUITER and DOCUMENT_SPECIALIST presets do not).

---

## 1. S-HR2 — one permission rule for HR

### Today

| Surface | Check today | File |
|---|---|---|
| Sidebar "HR Board" / "Team on duty" | `main.hr_board` grant | `src/components/shell/nav-config.ts:107-110` |
| Proxy for `/hr/admin` | role must be ADMIN — every other role is redirected to `/hr`, ignoring grants and the owner flag | `src/proxy.ts:67` |
| HR Board page | `requirePermission('main','hr_board','view')` | `src/app/(app)/hr/admin/page.tsx:29` |
| HR Board data (after S-HR1) | internal staff + `main.hr_board.view` | `src/modules/hr/service.ts` |
| Correct attendance | `requireRole(['ADMIN'])` (owner passes) | `service.ts` `correctAttendance` |
| Edit staff profile | `requireRole(['ADMIN'])` (owner passes) | `service.ts` `upsertStaffProfile` |
| `/hr/team` page | signed-in only; data scoped to the caller's direct reports | `src/app/(app)/hr/team/page.tsx:25` |
| "Admin view" link on `/hr` | `role === 'ADMIN'` | `src/app/(app)/hr/page.tsx` |

Effect: a MANAGER sees "HR Board" in the nav (they hold the grant) and is
redirected when they click it; a non-ADMIN owner is blocked by the proxy;
corrections and profile edits ignore the HR grant entirely.

### Proposed

| Operation | Rule |
|---|---|
| See HR Board, directory, team-wide counts, "who's working now" | `main.hr_board.view` (owner bypass) — already enforced on the data since S-HR1 |
| Open `/hr/admin` | same rule in the proxy and the page (replace the ADMIN-role check in `proxy.ts:67`) |
| Correct attendance | `main.hr_board.edit` **and** the self-correction rule in §3 |
| Create / edit staff profile | `main.hr_board.edit` |
| `/hr/team` | signed-in; data stays limited to the caller's direct reports (no change in scope) |
| Nav items and the "Admin view" link | computed from the same rule as the page |

Effect on presets if approved: ADMIN / owner — no change. MANAGER — gains
the HR Board page they already see in the nav, and (with `edit`) the
ability to correct attendance and edit profiles. Decide whether MANAGER
should keep `hr_board.edit` before approving.

---

## 2. S-HR3 — Europe/Dublin calendar rules and overnight sessions

### Today

The app defines `BUSINESS_TIMEZONE = 'Europe/Dublin'`
(`src/lib/zoned-time.ts:11`) but HR uses the **server's** local midnight
(`setHours(0,0,0,0)`) for:

- "today" on My attendance and the topbar widget (`fetchMyTodayStatus`);
- team "today" rows and counts (`fetchTodayAttendance`, `fetchHrDashboard`);
- "late" = clock-in after 09:15 (`fetchHrDashboard`);
- the once-per-day clock-in limit (`clockIn`).

If the server runs in UTC, during Irish Summer Time the day starts at
01:00 Dublin time and "late" means after 10:15 Dublin time. The HR Board
date filter also uses UTC day boundaries (`src/lib/date-range.ts`).

**Overnight sessions:** `fetchMyTodayStatus` only loads sessions that
started today. A session still open from yesterday (auto-closed only after
14 hours) shows as "Off the clock"; pressing Clock in then fails with
"already clocked in", because the one-open-session rule still applies.

### Proposed

- Compute every HR day boundary in Europe/Dublin (shared helper), for
  today, late, the daily limit and the HR Board date filter.
- Show a session that is still open from a previous day as "Working since
  <date, time>" with a "Clock out" action, instead of "Off the clock".
- Keep: server-generated timestamps, one open session per user, the
  once-per-day rule and its message, the 14-hour auto-close, and the
  `E2E_SKIP_HR_DAILY_LIMIT` test exception.

---

## 3. Attendance corrections: self-correction and audit

### Today

- `correctAttendance` accepts any session id from an ADMIN (or owner),
  **including the admin's own sessions**. There is no second reviewer.
- Each correction is audited with before/after clock-in/out and the
  reason (≥ 3 characters) in the audit context. The session row keeps only
  the latest `correctionReason`, `correctedByUserId` and `correctedAt`.
- Corrections do not adjust breaks (a break can end up outside the new
  window) and do not clear `autoClosed`. Leaving clock-out blank re-opens a
  closed session, which can fail with a raw database error if the user
  already has another open session.
- The HR Board shows an "edit" badge but not who corrected, when or why.

### Target policy (owner decision, 31 October 2026)

**Administrators must not correct their own attendance. A correction
requires a different authorised reviewer and an audit trail.**

### Proposed enforcement

1. Server: `correctAttendance` refuses when `session.userId` equals the
   acting user (owner included), with a clear message; the refusal is
   audited.
2. Reviewer: a correction is made by a different user holding
   `main.hr_board.edit` (see §1). Optional later step: a two-step
   request → approve flow so staff can ask for a fix to their own time.
3. Audit: keep the before/after event; also record breaks affected and
   the reviewer; show the trail (who, when, why, before → after) on the
   HR Board.
4. Integrity: adjust or reject breaks outside the new window; clear
   `autoClosed` on a manual close; replace "leave blank" with an explicit
   "Keep open" / "Close at" choice; map the open-session conflict to a
   readable error.

---

## 4. "Team on duty" (owner decision, 31 October 2026)

"Team on duty" means **currently clocked-in members of the user's
authorised direct-report team.** Today `/hr/team` lists all direct reports
with their latest state. In the visual phase the page keeps its data scope
and is labelled **"My team"**. A filtered "Team on duty" view (direct
reports who are clocked in now, same authorisation) can be added as a
separate, approved change.

---

## Reference: S-HR1 HR privacy (implemented, awaiting acceptance)

- Clock-in / clock-out IP addresses are no longer returned by any HR read
  helper or action result (`AttendanceSessionView`, `toSessionView` in
  `src/modules/hr/service.ts`). They stay in the table and the audit log.
- Team-wide readers (`fetchRecentAttendance`, `fetchTodayAttendance`,
  `fetchStaffDirectory`, `fetchStaffCurrentlyWorking`, `fetchHrDashboard`)
  require `main.hr_board.view` (owner bypass) in addition to internal staff.
- The main dashboard fetches and renders the People strip and "who's
  working now" card only for users with `main.hr_board.view`; the My
  attendance team count follows the same rule (previously ADMIN/STAFF by
  role). No grants, roles or database changes.
