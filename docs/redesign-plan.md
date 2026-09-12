# Ireland Career Gateway — Redesign Plan

**Status**: Draft for your review
**Author**: Claude
**Date**: 2026-09-12

---

## 1. Goal

Split the platform into three sibling workspaces (Candidate Services, Recruitment, Immigration) plus a **Main Dashboard** hub for owners/admins, gated by fine-grained per-module + per-verb permissions.

## 2. Constraints you've locked in

| Decision | Choice |
|---|---|
| Approach | Design doc → your sign-off → implementation |
| Roles vs permissions | Roles become **presets** for a permission matrix |
| Permission depth | **View / Create / Edit / Delete / Manage** on every module, from day one |
| Attendance breaks | **Multiple breaks per shift** (child table) |
| Workspace persistence (my call) | Cookie-backed session preference; land on last-used workspace |
| Owner concept (my call) | New `is_owner` bool on `users`. Exactly one owner per DB. Owner has every permission implicitly, cannot be revoked |

---

## 3. Business ↔ Module inventory

Your list, laid out as the source of truth:

```
Main Dashboard (owner/admin hub)
  ├─ overview
  ├─ activities
  ├─ hr_board
  ├─ admin
  └─ accounts

Candidate Services
  ├─ dashboard
  ├─ leads
  ├─ candidates
  ├─ documents
  ├─ applications
  ├─ engagements
  └─ payments

Recruitment
  ├─ dashboard
  ├─ employers
  ├─ requisitions
  ├─ matching
  ├─ interviews
  ├─ campaigns
  ├─ prospects
  └─ placements

Immigration
  ├─ dashboard
  ├─ cases
  └─ activities
```

Total: **23 modules** × 5 verbs = up to 115 permission bits per user. Owner bypasses this check.

**Small clarification I'm making up front:** "Activities" appears in both Main Dashboard and Immigration. In the code they're different concepts — Main → activities = the org-wide audit + comms feed; Immigration → activities = case-scoped tasks/notes. I'll namespace them as `main.activities` and `immigration.activities` in the permission keys so they can be granted independently.

---

## 4. Data model changes

### 4.1 New tables

```sql
-- One row per (user, permission-key). Absence = denied.
CREATE TABLE user_permissions (
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business      text NOT NULL,       -- 'main' | 'candidate_services' | 'recruitment' | 'immigration'
  module        text NOT NULL,       -- 'leads' | 'candidates' | 'dashboard' | ...
  verb          text NOT NULL,       -- 'view' | 'create' | 'edit' | 'delete' | 'manage'
  granted_at    timestamptz NOT NULL DEFAULT NOW(),
  granted_by    uuid REFERENCES users(id),
  PRIMARY KEY (user_id, business, module, verb)
);

-- Multiple breaks per attendance session.
CREATE TABLE attendance_break_sessions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_session_id uuid NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  break_started_at      timestamptz NOT NULL,
  break_ended_at        timestamptz,   -- NULL = currently on break
  duration_minutes      int GENERATED ALWAYS AS
                          (EXTRACT(EPOCH FROM (break_ended_at - break_started_at)) / 60)::int STORED,
  CONSTRAINT break_valid CHECK (break_ended_at IS NULL OR break_ended_at > break_started_at)
);

CREATE UNIQUE INDEX one_open_break_per_session
  ON attendance_break_sessions (attendance_session_id)
  WHERE break_ended_at IS NULL;
```

### 4.2 Column additions

```sql
ALTER TABLE users
  ADD COLUMN is_owner   boolean NOT NULL DEFAULT false,
  ADD COLUMN current_workspace text;   -- last-used, for landing page

-- Partial unique index: exactly one owner.
CREATE UNIQUE INDEX users_single_owner ON users((is_owner)) WHERE is_owner = true;
```

### 4.3 What we're NOT touching

- `role` column stays. It becomes the **preset key** used when creating a user; the checkbox editor is initialised from it. This lets existing per-service `requireRole([...])` code keep working unchanged.
- `attendance_sessions` (parent) unchanged. Breaks are additive.

---

## 5. Permission model

### 5.1 Preset seeds (role → default checkboxes)

When the owner creates a user and picks a role, we pre-check a sensible starting set:

| Role | Businesses enabled by default | Verb defaults |
|---|---|---|
| ADMIN | All 4 workspaces | Every verb, every module |
| MANAGER | Candidate Services + Recruitment + Immigration | View/Create/Edit everywhere; Delete on nothing; Manage on assigned modules |
| RECRUITER | Recruitment only | View/Create/Edit on all Recruitment modules |
| DOCUMENT_SPECIALIST | Candidate Services (documents), Immigration (cases) | View/Create/Edit on documents + cases only |
| FINANCE | Candidate Services (payments, engagements) + Main→Accounts | View/Create/Edit on billing modules |
| STAFF | Nothing pre-checked | Owner fills in |

The presets are just a UX helper — the source of truth is the checkbox matrix.

### 5.2 Server-side check

New helper: `requirePermission(business, module, verb)` — throws 403 if the user hasn't been granted it. Owner always passes.

Existing `requireRole(['ADMIN', ...])` calls are **not removed**; they act as a coarse pre-filter. The permission check runs after and is the tighter gate.

### 5.3 Middleware (edge)

`src/proxy.ts` already gates workspace/portal routes. It'll now:

1. Look up user permissions from a signed JWT claim (baked in at login).
2. If the URL is in a workspace the user doesn't have `view` on any module of, redirect to Main Dashboard (or to their first accessible workspace).
3. Per-route module gating happens server-side in each `page.tsx`.

---

## 6. Navigation refactor

### 6.1 Nav config split

`src/components/shell/nav-config.ts` becomes:

```ts
export const WORKSPACES = {
  main:              { label: 'Main Dashboard',    icon: Home,       sections: [...] },
  candidate_services:{ label: 'Candidate Services', icon: Users,      sections: [...] },
  recruitment:       { label: 'Recruitment',        icon: Briefcase,  sections: [...] },
  immigration:       { label: 'Immigration',        icon: PlaneTakeoff, sections: [...] },
};
```

The sidebar renders only the currently-selected workspace's sections, filtered by the user's permissions.

### 6.2 Business switcher (top-left, next to logo)

```
┌────────────────────────────────────────────────────────────┐
│  [🍀] Ireland Career Gateway  [Recruitment ▾]              │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  [Business switcher expanded]                              │
│  ┌──────────────────────┐                                  │
│  │  Main Dashboard    ● │  ← owner + granted only          │
│  │  Candidate Services  │                                  │
│  │  Recruitment       ✓ │  ← currently active              │
│  │  Immigration         │                                  │
│  └──────────────────────┘                                  │
└────────────────────────────────────────────────────────────┘
```

Behaviour:
- Click brand mark → go to landing page (last-used workspace, or Main if owner)
- Click switcher → dropdown with only the workspaces this user has any permission for
- Picking a workspace writes a cookie `icg_workspace=<key>` and navigates to that workspace's default page (`/dashboard` inside the workspace)

### 6.3 Route layout

Every route stays where it is today — the "workspace" is a **display concept**, not a URL prefix. This keeps every existing link, bookmark, and E2E test working. Cookie decides which nav shows.

Alternative (URL-based `/w/recruitment/candidates/...`) is more work and provides bookmarking of workspace-scoped links, but you didn't ask for that and the value is thin.

---

## 7. Permissions editor UI

New page: `/admin/users/[id]/permissions` (owner-only + explicit `admin.manage` grant).

Layout:

```
─────────────────────────────────────────────────────────────────────
Sarah O'Brien — Permissions            [Reset to role default: RECRUITER ▾]

┌─  Main Dashboard   ─────────────────────────────────────────────┐
│ Overall business access to the main dashboard hub                │
│                                                                  │
│              View   Create  Edit   Delete  Manage                │
│  Overview    [x]    [ ]     [ ]    [ ]     [ ]                   │
│  Activities  [x]    [ ]     [ ]    [ ]     [ ]                   │
│  HR Board    [ ]    [ ]     [ ]    [ ]     [ ]                   │
│  Admin       [ ]    [ ]     [ ]    [ ]     [ ]                   │
│  Accounts    [ ]    [ ]     [ ]    [ ]     [ ]                   │
└──────────────────────────────────────────────────────────────────┘

┌─  Recruitment   ────────────────────────────────────────────────┐
│              View   Create  Edit   Delete  Manage                │
│  Dashboard   [x]    [x]     [x]    [ ]     [ ]                   │
│  Employers   [x]    [x]     [x]    [ ]     [ ]                   │
│  ... etc                                                         │
└──────────────────────────────────────────────────────────────────┘

[Cancel]                                                [Save]
```

Rules baked in:
- **Create/Edit/Delete/Manage imply View** — checking any of them auto-checks View
- **Manage implies Delete implies Edit** — checking Manage cascades down
- Owner cannot lose the Owner flag from this UI (belt & braces)

## 8. Attendance rework

### 8.1 New attendance state machine

```
Not clocked in
   ↓ Clock in
Working
   ↓ Start break     ↑ Clock out
On break
   ↓ End break
Working
   ↓ Clock out
Complete
```

At any time, exactly one of these states holds. The partial unique indexes (existing `one_open_session` on attendance_sessions, new `one_open_break_per_session`) enforce it at the DB level.

### 8.2 Today card (`/hr`)

```
┌────────────────────────────────────────────────────────┐
│  🟢 Working                     [ Start break ]        │
│                                                        │
│  Clocked in    09:02  •  4h 17m ago                    │
│  Breaks        1 × 30 min                              │
│  Hours worked  3h 47m                                  │
│                                                        │
│  [ Clock out ]                                         │
└────────────────────────────────────────────────────────┘
```

State transitions replace state, buttons swap:
- Working → shows Start break + Clock out
- On break → shows End break; Clock out disabled
- Complete → shows Clock in (starts a new session for tomorrow)

### 8.3 History filters

Reuses the DateRangeFilter we just built. Shortcuts on the /hr and /hr/team pages:
`Today | This week | This month | Custom`

Table shape:

```
Date      Clock In   Breaks       Clock Out   Total   Status
Mon 08    09:02      30 min       17:05       7h 33m  Complete
Tue 09    08:58      45 min       17:10       7h 27m  Complete
Wed 10    09:05      30 min so far —           —      🟠 On break
```

### 8.4 Manager view (`/hr/team`)

Same table shape, one row per direct report per day, plus a top strip showing:
`Clocked in now: 3 · On break: 1 · Not started: 2`

---

## 9. Migration story (how do existing users survive?)

1. Migration seeds `user_permissions` from each user's current `role`:
   - ADMIN → every permission
   - MANAGER / RECRUITER / etc → their preset set
   - STAFF → nothing (owner fills in later)
2. `is_owner` gets flipped `true` on one designated user (probably `tech@abbeyblue.eu`). Confirmed before running.
3. Every existing route keeps working — the middleware treats a legacy user with 0 permissions as "no workspace access → land on `/login`" so nobody gets stranded silently.

---

## 10. Rollout — 4 phases, ~1 PR each

### Phase A: schema + auth foundations (no visible change)

Deliverable: the DB has permissions, the code can check them, but nothing in the UI has changed yet.

**Files**:
- `src/lib/db/schema/permissions.ts` (new)
- `src/lib/db/schema/hr.ts` (extend with break sessions)
- `src/lib/db/schema/users.ts` (`is_owner`, `current_workspace`)
- `src/lib/db/migrations/00XX_permissions.sql` (new)
- `src/lib/auth/permissions.ts` (new — `hasPermission`, `requirePermission`)
- `src/lib/auth/session.ts` (JWT claim carries permission keys)
- `scripts/seed-owner.ts` (mark tech@abbeyblue.eu as owner)
- One migration script to seed `user_permissions` from role
- Vitest for permission helpers

### Phase B: workspace split + business switcher

Deliverable: nav is workspace-scoped; owner sees Main Dashboard; every other user lands in their default workspace.

**Files**:
- `src/components/shell/nav-config.ts` (refactor to `WORKSPACES`)
- `src/components/shell/app-sidebar.tsx` (filter by current workspace + permissions)
- `src/components/shell/business-switcher.tsx` (new)
- `src/components/shell/top-bar.tsx` (mount the switcher next to the brand)
- `src/proxy.ts` (workspace-aware redirects)
- `src/app/(app)/main/` (new folder, Main Dashboard entry — moves the current `/dashboard` content in)
- Cookie helpers for `icg_workspace`

### Phase C: permissions editor + owner-add-user flow

Deliverable: `/admin/users/[id]/permissions` matrix editor, owner can grant/revoke.

**Files**:
- `src/app/(app)/admin/users/[id]/permissions/page.tsx` (new — the matrix)
- `src/modules/permissions/service.ts` (new — grant/revoke actions with audit)
- Every `page.tsx` that fronts a gated module (~23 of them) gets one line: `await requirePermission('recruitment', 'candidates', 'view')`
- Every mutating server action gets a verb-appropriate check
- Vitest for the grant/revoke actions

### Phase D: attendance rework

Deliverable: real-time attendance card with breaks; new history filters; new manager view.

**Files**:
- `src/lib/db/schema/hr.ts` (already extended in Phase A — this phase uses it)
- `src/modules/hr/service.ts` (start/end break actions)
- `src/modules/hr/actions.ts`
- `src/app/(app)/hr/page.tsx` (redesigned Today card)
- `src/app/(app)/hr/attendance-card.tsx` (new)
- `src/app/(app)/hr/attendance-history.tsx` (new — table with DateRangeFilter reuse)
- `src/app/(app)/hr/team/page.tsx` (redesigned manager view)

---

## 11. Risks + edge cases I'm flagging up front

- **Owner deletion**: if the owner ever tries to delete themselves via the users admin — we hard-block. If the owner needs to hand off, we build an explicit "transfer ownership" flow later.
- **Permission drift**: user is granted a permission today; module is renamed later. Migrations must include a permission-key rewrite step. I'll add a runbook note.
- **"Manage" verb**: I'm defining Manage as "can grant/revoke module permissions to other users in this module". If you meant something else (e.g. "can archive"), tell me now.
- **Legacy per-role gates**: existing `requireRole(['ADMIN', 'FINANCE'])` calls stay in place as a belt-and-braces layer. Only the finer permission gates are new.
- **JWT size**: 115 possible perms in the JWT is ~1KB. Fine. If it ever explodes, we swap to a session-store lookup.
- **The 100 seed candidates + owner user**: I'll re-seed `is_owner=true` on your admin login and grant every permission. Nothing you've done breaks.

---

## 12. What I need from you

1. **Sign-off** on the plan (or push back on any specific piece).
2. **Which user is the owner?** — I'll assume `tech@abbeyblue.eu` unless you tell me otherwise.
3. **Confirm rollout is sequential** (A → B → C → D). Each phase is a self-contained diff you can review before I move on.
4. **Confirm** that the `role` column stays as a preset key — you didn't want it deleted, but I want to hear that clearly.

Once you're happy, I start **Phase A**.
