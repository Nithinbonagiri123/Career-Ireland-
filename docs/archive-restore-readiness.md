# Archive → Restore readiness audit

Audited on 31 Oct 2026 at about 14:00 (Europe/Dublin), against the working tree on `main` at `240b30f` plus uncommitted edits. This was a read-only review: no code was changed and nothing was run against the database. Other agents are editing the code at the same time, so the line numbers below are what the files contained during the audit.

## Purpose and owner instruction

> "Verify server-side authorization, required reason and audit logging before exposing Restore actions. Do not bypass missing controls."

Every module has an `unarchive*` service and server action, but only Campaigns shows a Restore button. Before we add Restore buttons for the other modules, this doc checks each restore path on the server for six things:

- who is allowed to call it
- whether it requires a reason
- whether it writes an audit record
- whether it refuses bad states
- what side effects it has
- what tests cover it

A module is **READY** only when all of these hold on the server. The UI must never be the only gate.

### Role key (from `src/lib/auth/permissions.ts:178-229` and `src/lib/auth/session.ts`)

| Check | What it allows |
|---|---|
| `requireInternalStaff()` (session.ts:143) | Any internal role: ADMIN, STAFF, MANAGER, RECRUITER, DOCUMENT_SPECIALIST, FINANCE. **This includes a STAFF user with zero grants** (the STAFF preset is empty, permissions.ts:217-221). It reads no grants, so revoking a grant never removes this access. |
| `requirePermission('recruitment', X, 'edit')` (session.ts:223, through `requireRecruitment`, recruitment-guards.ts:10) | The owner (`isOwner` bypass, session.ts:230), plus anyone with a `recruitment.X` edit/delete/manage grant. Preset defaults: ADMIN ✅, MANAGER ✅, RECRUITER ✅. FINANCE ❌: it has view only on employers, requisitions and placements (permissions.ts:212) and no campaigns or leads grants. STAFF ❌ and DOCUMENT_SPECIALIST ❌ unless granted. |
| Owner | Passes every `requirePermission` check. For `requireRole` lists it passes only when ADMIN is in the list (role-rules.ts:20-25). |

The presets are only defaults. The real source of truth is the `user_permissions` table, which the owner can edit.

---

## Summary table

| Module | Restore action → service | Restore permission | Same as archive? | Reason required / stored | Audited | Guards | Dependent effects | Verdict |
|---|---|---|---|---|---|---|---|---|
| Persons (people / candidates) | `persons/actions.ts:59` → `persons/service.ts:357` | `requireInternalStaff()` (any staff, incl. zero-grant STAFF) | Yes (archive :322) | Yes, Zod `min(3)` **untrimmed**; stored in `audit_events.context.reason` only | `UNARCHIVED`, before/after `archivedAt`, reason, same transaction | NOT_ARCHIVED ✅; **no row lock**; `before` is read outside the transaction; **no merged-person check** | `revalidateAll()`. **The second concept `candidate_profiles.lifecycleStatus='ARCHIVED'` has its own restore with no reason** | **NEEDS FIX** |
| Employers | `employers/actions.ts:72` → `employers/service.ts:607` | `recruitment.employers.edit` | Yes (archive :575) | Yes, `min(3)` untrimmed; audit only | `UNARCHIVED`, before/after, reason, same transaction | NOT_ARCHIVED ✅; no row lock | Revalidates `/employers` and `/employers/[id]`. **`status='ARCHIVED'` is a second concept, not touched** | **NEEDS FIX** (shared fixes only) |
| Immigration cases | `immigration/actions.ts:103` → `immigration/service.ts:844` | `requireInternalStaff()` | Yes (archive :801) | Yes, `min(3)` untrimmed; audit only | `UNARCHIVED`, before/after, reason, same transaction | NOT_ARCHIVED ✅; no row lock; no check that the beneficiary or sponsor is archived | `revCase(caseId)` | **NEEDS FIX** |
| Requisitions (jobs) | `requisitions/actions.ts:81` → `requisitions/service.ts:583` | `recruitment.requisitions.edit` | Yes (archive :552) | Yes, `min(3)` untrimmed; audit only | `UNARCHIVED`, before/after, reason, same transaction | NOT_ARCHIVED ✅; no row lock; **no check that the employer is archived** | Revalidates `/requisitions` and `/requisitions/[id]`. Status unchanged | **NEEDS FIX** |
| Placements | `placements/actions.ts:64` → `placements/service.ts:855` | `recruitment.placements.edit` | Yes (archive :824) | Yes, `min(3)` untrimmed; audit only | `UNARCHIVED`, before/after, reason, same transaction | NOT_ARCHIVED ✅; no row lock; **no seat or duplicate check**; no check that the parent requisition or person is archived | **`positions_filled` and requisition status are not recomputed**; `rev()` | **NEEDS FIX** (highest risk) |
| Campaigns | `campaigns/actions.ts:60` → `campaigns/service.ts:493` | `recruitment.campaigns.edit` | Yes (archive :461) | Yes, **trimmed** `min(3)` (schemas.ts:14-18), returns a ValidationError; audit only | `UNARCHIVED`, before/after, reason, same transaction | NOT_ARCHIVED ✅; **row lock `FOR UPDATE`** (service.ts:220-229) ✅ | `rev()`; edits blocked while archived (service.ts:298, :365) | **READY** (already exposed) |
| Leads | `leads/actions.ts:48` → `leads/service.ts:239` | `requireInternalStaff()`, **plus** `recruitment.leads.edit` only when `targetBusiness='RECRUITMENT'` | Yes (archive :210/:215) | Yes, `min(3)` untrimmed; audit only | `UNARCHIVED`, before/after, reason, same transaction | NOT_ARCHIVED ✅; `before` read outside the transaction; no lock | `revalidate()` | **NEEDS FIX** |
| Service engagements (commerce) | `commerce/actions.ts:59` → `commerce/service.ts:857` | `requireInternalStaff()` | Yes (archive :826) | Yes, `min(3)` untrimmed; audit only | `UNARCHIVED`, before/after, reason, same transaction | NOT_ARCHIVED ✅; `before` read outside the transaction; no lock | `revalidate()` | **NEEDS FIX** |
| Tasks / communication logs (activities) | No restore exists (archive only, `activities/service.ts:~373, ~418`) | — | — | — | — | — | — | **Do not expose.** Out of scope |

No other code path clears `archivedAt`. A grep for `archivedAt: null` in `.set(...)` finds only the eight services above. `recordRevert` (`src/lib/audit/withAudit.ts:53`) is never called, so the audit log offers no back-door restore.

---

## Findings that apply to every module

These are code-only fixes. None needs a schema change.

**C1. Whitespace counts as a reason.** Every schema except Campaigns uses `z.string().min(3).max(500)` without `.trim()`:

- `persons/schemas.ts:181-184`
- `employers/schemas.ts:42-45`
- `immigration/schemas.ts:84-87`
- `requisitions/schemas.ts:70-73`
- `placements/schemas.ts:56-59`
- `leads/schemas.ts:147-150`
- `commerce/schemas.ts:54-57`

`"   "` passes. The same is true of every matching `Archive*Schema`. *Fix:* use one shared `reasonSchema` (`z.string().trim().min(3).max(500)`), as Campaigns does at `campaigns/schemas.ts:14-18`. Apply it to both archive and restore.

**C2. A bad reason shows "Something went wrong".** These services call `Schema.parse(input)`, which throws a ZodError. `toActionResult` (`src/lib/result.ts:21-35`) maps only `ValidationError`/`AppError`, so a missing or short reason comes back as `INTERNAL_ERROR`, "Something went wrong", and is also sent to Sentry. The server still blocks the restore, so the control holds, but the dialog can't show a field error. *Fix:* use `parseOrThrow` or `safeParse` → `ValidationError`, as Campaigns (`campaigns/service.ts:496`) and `upsertEmployer` (`employers/service.ts:233-239`) do.

**C3. Two restores can both succeed.** Only Campaigns locks the row with `FOR UPDATE`. Elsewhere the code reads the row with a plain `SELECT` and then updates with `WHERE id = …` and no `archived_at IS NOT NULL` condition. If two users click Restore at the same moment, both succeed and two `UNARCHIVED` audit rows are written. Persons, leads and engagements also read `before` through `db`, outside the transaction:

- `getPerson`: `persons/repository.ts:74-77`
- `getLead`: `leads/repository.ts:199-202`
- `getEngagement` called without `tx`: `commerce/service.ts:863`

*Fix:* read with `.for('update')` inside the transaction, or update `WHERE id = ? AND archived_at IS NOT NULL RETURNING` and throw `NOT_ARCHIVED` when no row comes back.

**C4. The reason is stored only in the audit log.** None of these tables has an `archive_reason` column; the schemas have only `archived_at`, and some also have `archived_by_user_id`. The archive reason and the restore reason live in `audit_events.context.reason`. That is enough for the owner's "audited reason" requirement. An "Archived by X on 31 Oct 2026 · 12:10: <reason>" banner would read the latest `ARCHIVED` audit event for the record. *Optional, needs a schema change:* add `archive_reason`, only if a cheap list-level display is wanted.

**C5. The `before` snapshot leaves out who archived the record.** Restore sets `archivedByUserId: null` (persons, requisitions, placements, campaigns, engagements), but the `before` snapshot records only `archivedAt`. *Fix (code-only):* add `archivedByUserId` to `before`. The original archiver is still recoverable from the `ARCHIVED` event, so this is low priority.

**C6. No tests outside Campaigns.** Only Campaigns has a restore test (`src/modules/campaigns/r4.test.ts:336-354`). It covers the happy path and the audit actions, but not authorization or the reason rules. No e2e spec calls any unarchive action. A grep of `e2e/` for unarchive finds nothing; `stage6f-workspace-acceptance.spec.ts` uses "restored" in an unrelated sense.

---

## Per-module detail

### 1. Persons (people / candidates)

- **Action:** `src/modules/persons/actions.ts:59-63`, which calls `revalidateAll()` on success.
- **Service:** `src/modules/persons/service.ts:357-386`. The archive is at `:321-354`.
- **Permission:** `requireInternalStaff()` at `:358`, the same as archive at `:322`. Any internal user can archive or restore any person, including:
  - FINANCE
  - DOCUMENT_SPECIALIST
  - a STAFF user with no grants

  No `candidate_services.candidates` or recruitment check is made.
- **Reason:** `UnarchivePersonSchema` at `persons/schemas.ts:181-184`, `min(3)` untrimmed. Archive also requires one (`:176-179`). The reason is stored in audit context.
- **Audit:** `recordAudit(tx, { entityType: 'person', action: 'UNARCHIVED', before: { archivedAt }, after: { archivedAt: null }, context: { reason } })` at `:376-384`, inside the same `db.transaction`.
- **Guards:**
  - `NOT_ARCHIVED` at `:363-365` ✅
  - `before` comes from `getPerson`, which reads through `db` outside the transaction, with no lock (C3).
  - **Missing merged-person check.** Archive refuses merged persons (`:330-332`), and `mergePersons` (`:257-275`) does not refuse an archived loser. So an archived person can be merged away and then restored: a merged ghost comes back to lists and the pipeline.
- **Dependent effects:** the pipeline filters `persons.archivedAt` (`pipeline/service.ts:88,108,124,143`), as do matching (`matching/service.ts:111,208,463`) and the pickers. A restore brings the person back everywhere, which is correct.
- **Two archive concepts:** `candidate_profiles.lifecycleStatus` (`'ACTIVE'|'INACTIVE'|'ARCHIVED'`, `src/lib/db/schema/persons.ts:169-173`) is separate from `persons.archivedAt`.
  - The "Archived" tab on `/candidates` filters on `lifecycleStatus`.
  - `lifecycleStatus` can be moved from ARCHIVED back to ACTIVE through `bulkUpdateCandidateLifecycle` (`candidates/bulk-service.ts:78-121`). That path uses only `requireInternalStaff()`, needs **no reason**, and audits `LIFECYCLE_CHANGED` with `context: { bulk, batchSize }` only.
  - It is live in the UI through `src/app/(app)/candidates/bulk-action-bar.tsx:175-226` (the "Set lifecycle…" → Active option). The orphaned `candidates/[id]/close-candidate-button.tsx` uses it too.
  - So a reason-less "restore" of the lifecycle kind already exists.
- **Tests:** none for `unarchivePerson`.
- **Verdict: NEEDS FIX.**
  1. Tighten archive and restore to a module permission. The suggestion is `requireAnyPermission([{candidate_services,candidates,edit},{recruitment,requisitions,edit}])`, but it is the owner's decision because a person spans workspaces. *Code-only.*
  2. Refuse to restore when `mergedIntoPersonId` is set (`PERSON_MERGED`). Also make `mergePersons` refuse or handle archived losers. *Code-only.*
  3. Apply C1–C3. *Code-only.*
  4. Decide how the two concepts relate: rename the lifecycle "Archived" to "Closed", or require a reason when the bulk lifecycle change moves a record from ARCHIVED to ACTIVE. Until then, the Restore button must call only `unarchivePersonAction`. *Code-only.*

### 2. Employers

- **Action:** `src/modules/employers/actions.ts:72-79`, which revalidates `/employers` and `/employers/[id]`.
- **Service:** `src/modules/employers/service.ts:607-638`. The archive is at `:574-604`.
- **Permission:** `requireRecruitment('employers','edit')` at `:608`, the same as archive at `:575`.
  - Allowed: owner, ADMIN, MANAGER, RECRUITER, and anyone with an employers edit grant.
  - Refused: FINANCE, STAFF, DOCUMENT_SPECIALIST.
  - The list page already computes `canEditEmployer = checkPermission('recruitment','employers','edit')` (`src/app/(app)/employers/page.tsx:64-66`), so the UI can mirror this exactly.
- **Reason:** `employers/schemas.ts:42-45`, `min(3)` untrimmed. Archive also requires one. The reason is in audit context.
- **Audit:** `UNARCHIVED`, before/after `archivedAt`, reason, inside the same transaction (`:627-635`).
- **Guards:** `NOT_ARCHIVED` (`:617-619`) ✅. The `SELECT` has no `FOR UPDATE` (C3). The table has no `archived_by_user_id` column (`schema/recruitment.ts:76`); the audit actor covers that.
- **Dependent effects:**
  - Archive does not cascade to requisitions, placements or cases, so restore needs none either.
  - **Second concept:** the employer edit dialog offers `status='ARCHIVED'` (`src/app/(app)/employers/employer-dialog.tsx:144`). This goes through `upsertEmployer` (employers.edit), without the archive reason flow.
  - Restore does not touch `status`. An employer archived both ways comes back into the list still labelled "Archived".
- **Tests:** none.
- **Verdict: NEEDS FIX (shared items only).** Authorization and audit are correct.
  1. Apply C1–C3. *Code-only.*
  2. Decide whether `status='ARCHIVED'` should be removed from the edit dialog, or have restore reset it. The banner should at least warn when `status==='ARCHIVED'` after a restore. *Code-only.*

### 3. Immigration cases

- **Action:** `src/modules/immigration/actions.ts:103-107`, using `revCase`.
- **Service:** `src/modules/immigration/service.ts:844-874`. The archive is at `:800-841`.
- **Permission:** `requireInternalStaff()` at `:845`, the same as archive at `:801`. Any internal user can restore any case, including FINANCE, which has only `immigration.cases view`, and a zero-grant STAFF user. This matches the rest of the immigration module today: every write in `immigration/service.ts` uses `requireInternalStaff()`. `docs/immigration-permissions-workflow-proposal.md:37` already proposes `immigration.cases.delete` for archive and restore.
- **Reason:** `immigration/schemas.ts:84-87`, `min(3)` untrimmed. Archive also requires one. The reason is in audit context.
- **Audit:** `UNARCHIVED`, before/after `archivedAt`, reason, inside the same transaction (`:863-871`).
- **Guards:**
  - `NOT_ARCHIVED` (`:854-856`) ✅. No lock (C3).
  - Archive refuses a case with an outstanding balance (`:816-822`), so a restore cannot hide or surface unpaid invoices. No restore-side balance check is needed.
  - Restore does not check whether the beneficiary person or sponsor employer is archived.
- **Dependent effects:**
  - Lists filter `archivedAt` (`:203-204, :242, :280`). Restore brings the case back to the case list and to person and employer tabs.
  - The detail page reads nothing about `archivedAt`. It still offers "Archive case" on an archived case (`src/app/(app)/immigration/[id]/page.tsx:452`).
- **Tests:** none.
- **Verdict: NEEDS FIX.**
  1. Gate archive and restore on `requirePermission('immigration','cases', <edit|delete>)` as the proposal decides. *Code-only.*
  2. Apply C1–C3. *Code-only.*
  3. Warn, or refuse, when the beneficiary is archived (`BENEFICIARY_ARCHIVED`). *Code-only.*

### 4. Requisitions (jobs)

- **Action:** `src/modules/requisitions/actions.ts:81-88`, which revalidates `/requisitions` and `/requisitions/[id]`.
- **Service:** `src/modules/requisitions/service.ts:583-611`. The archive is at `:551-581`.
- **Permission:** `requireRecruitment('requisitions','edit')` at `:586`, the same as archive at `:552`.
  - Allowed: owner, ADMIN, MANAGER, RECRUITER.
  - Refused: FINANCE (view only), STAFF, DOCUMENT_SPECIALIST.
  - The UI already has `canEditJob` (`src/app/(app)/requisitions/page.tsx:92-94`).
- **Reason:** `requisitions/schemas.ts:70-73`, `min(3)` untrimmed. Archive also requires one. The reason is in audit context.
- **Audit:** `UNARCHIVED`, before/after `archivedAt`, reason, inside the same transaction (`:600-608`). Restore clears `archivedByUserId`, which `before` does not record (C5).
- **Guards:**
  - `NOT_ARCHIVED` (`:591-593`) ✅. `findRequisition` uses `tx`, but with no lock (C3).
  - **No parent check:** a requisition can be restored under an archived employer. It would then show in job lists while its employer is hidden.
- **Dependent effects:**
  - Status and `positions_filled` are left as they were, which is correct because archive doesn't change them either.
  - While a job is archived, `lockOpenRequisition` (`matching/service.ts:68-83`) checks only CLOSED/CANCELLED, so shortlisting and matching still work on an archived job. This is an archive-side gap, but the Restore banner design should hide mutating actions while archived.
- **Tests:** none.
- **Verdict: NEEDS FIX.**
  1. Apply C1–C3. *Code-only.*
  2. Refuse restore when `employers.archivedAt` is set (`EMPLOYER_ARCHIVED`, with the message "Restore the employer first"). *Code-only.*
  3. Recommended alongside: make `lockOpenRequisition` treat `archivedAt != null` as not open. *Code-only.*

### 5. Placements

- **Action:** `src/modules/placements/actions.ts:64-68`, using `rev()`.
- **Service:** `src/modules/placements/service.ts:855-881`. The archive is at `:823-853`.
- **Permission:** `requireRecruitment('placements','edit')` at `:856`, the same as archive at `:824`.
  - Allowed: owner, ADMIN, MANAGER, RECRUITER.
  - Refused: FINANCE (view only), STAFF, DOCUMENT_SPECIALIST.
  - The UI already passes `canEdit` (`src/app/(app)/placements/page.tsx:69-72`).
- **Reason:** `placements/schemas.ts:56-59`, `min(3)` untrimmed. Archive also requires one. The reason is in audit context.
- **Audit:** `UNARCHIVED`, before/after `archivedAt`, reason, inside the same transaction (`:870-878`).
- **Guards:**
  - `NOT_ARCHIVED` (`:861-863`) ✅. No lock (C3).
  - **No seat or duplicate re-check.** Every path that makes a placement seat-holding calls `assertSeatAvailable` (`:592-645`), which checks duplicates per person and per requisition plus `REQUISITION_OVERFILLED`. Restore skips it.
  - Archived seats are deliberately ignored, so a new placement can take the seat while the old one is archived (test `placements/seat-guards.test.ts:183-208`). Restoring the old CONFIRMED/STARTED/COMPLETED placement afterwards **overfills the requisition**, or creates a **duplicate live placement** for the same person and job.
  - No check that the parent requisition or person is archived.
- **Dependent effects:**
  - **Neither archive nor restore calls `recomputeRequisitionFillCount`** (`:659-705`); the archive docstring at `:822` says so. The stored `job_requisitions.positions_filled` and status (FILLED / PARTIALLY_FILLED) go stale.
  - Dashboards and the employer "seats to fill" figure read the stored column (`employers/service.ts:71`, `dashboard/service.ts:258, :441`), so those numbers are wrong after a restore.
  - Restore does not touch the candidate's `availabilityStatus`. That is consistent with archive (UI copy: `placements-table.tsx:266`).
- **Tests:** none for unarchive. Seat-guard tests exist for create and transition only.
- **Verdict: NEEDS FIX. This is the highest-risk module; do not expose until all four fixes land.**
  1. Inside the restore transaction, if the placement status is seat-holding, call `assertSeatAvailable(tx, { requisitionId, forPersonId: before.personId, employerId: before.employerId, excludePlacementId: before.id })` **before** clearing `archivedAt`. Note that `assertSeatAvailable` excludes archived rows, so it must run while the row is still archived. *Code-only.*
  2. Call `recomputeRequisitionFillCount(tx, actor, before.jobRequisitionId)` after restore, and also after archive. *Code-only.*
  3. Refuse restore when the parent requisition or person is archived. *Code-only.*
  4. Apply C1–C3, using `.for('update')` on the placement. `assertSeatAvailable` already locks the requisition. *Code-only.*

### 6. Campaigns (reference implementation, already exposed)

- **Action:** `src/modules/campaigns/actions.ts:60-64`, using `rev()`.
- **Service:** `src/modules/campaigns/service.ts:493-520`. The archive is at `:459-491`.
- **Permission:** `requirePermission('recruitment','campaigns','edit')` at `:497`, the same as archive at `:461`.
  - Allowed: owner, ADMIN, MANAGER, RECRUITER.
  - Refused: FINANCE, STAFF, DOCUMENT_SPECIALIST.
  - The UI gates the Restore button on `canEditCampaign && !running` (`src/app/(app)/campaigns/[id]/page.tsx:437-453`), which mirrors the server check.
- **Reason:** the shared trimmed `reason` (`campaigns/schemas.ts:14-18`) through `parseOrThrow`, so the user gets a proper field error. The dialog is `campaign-status-dialogs.tsx:104-150`.
- **Audit:** `UNARCHIVED`, before/after, reason, inside the same transaction (`:509-517`).
- **Guards:** `lockCampaign` uses `FOR UPDATE` (`:220-229`) ✅, plus `NOT_ARCHIVED` ✅. Edits are refused while archived with `CAMPAIGN_ARCHIVED` (`:298, :365`) ✅. Restore does not re-validate the linked job or employer, which is minor because save re-validates through `resolveCampaignJob`.
- **Dependent effects:** none needed. A restored campaign keeps its terminal status (COMPLETED or CANCELLED).
- **Tests:** `campaigns/r4.test.ts:336-354` covers the reason, edit blocking and audit actions.
- **Verdict: READY.** Optional: add authorization tests for "FINANCE can't restore" and "whitespace reason refused".

### 7. Leads (found in the sweep)

- **Action:** `src/modules/leads/actions.ts:48-52`.
- **Service:** `src/modules/leads/service.ts:239-266`. The archive is at `:209-236`.
- **Permission:** `requireInternalStaff()` at `:240`, plus `requireRecruitment('leads','edit')` only when `targetBusiness==='RECRUITMENT'` (`:245`). This is the same as archive (`:210, :215`). Candidate Services and Immigration leads can be restored by any internal user, even though `candidate_services.leads` and `immigration.leads` modules exist.
- **Reason:** `min(3)` untrimmed (`leads/schemas.ts:147-150`). The reason is in audit context.
- **Audit:** `UNARCHIVED` with reason, inside the same transaction (`:255-263`).
- **Guards:** `NOT_ARCHIVED` ✅. `getLead` reads through `db`, outside the transaction (C3).
- **UI:** the list has an Archive action only (`src/app/(app)/leads/leads-table.tsx:193`). No Restore exists.
- **Verdict: NEEDS FIX.**
  1. Gate on the lead's business module (`candidate_services.leads` / `immigration.leads` / `recruitment.leads`, edit). *Code-only.*
  2. Apply C1–C3. *Code-only.*

### 8. Service engagements (found in the sweep)

- **Action:** `src/modules/commerce/actions.ts:59-63`.
- **Service:** `src/modules/commerce/service.ts:857-885`. The archive is at `:825-855`.
- **Permission:** `requireInternalStaff()` at `:860`, the same as archive at `:826`. The `candidate_services.engagements` module exists (FINANCE and MANAGER have edit by default) but is not checked.
- **Reason:** `min(3)` untrimmed (`commerce/schemas.ts:54-57`). The reason is in audit context.
- **Audit:** `UNARCHIVED` with reason, inside the same transaction (`:874-882`).
- **Guards:** `NOT_ARCHIVED` ✅. `getEngagement(id)` is called without `tx` (C3).
- **Dependent effects:** transaction lists filter `archivedAt` (`:281`) and so does the client workspace (`clients/workspace-data.ts:634`). Restore brings the engagement back into money views.
- **Side note on archive:** unlike `archiveCase`, `archiveEngagement` has no outstanding-balance guard. That is an archive-side money risk, not a restore risk.
- **Verdict: NEEDS FIX.**
  1. Gate archive and restore on `requirePermission('candidate_services','engagements','edit')`. *Code-only.*
  2. Apply C1–C3. *Code-only.*
  3. Recommended separately: add an outstanding-balance guard to archive. *Code-only.*

---

## Cross-cutting recommendations

1. **One shared `RestoreDialog`.** Model it on `ArchiveCampaignDialog` (`campaign-status-dialogs.tsx:104`).
   - It requires a reason: a trimmed textarea of 3–500 characters, with the submit button disabled until the reason is valid.
   - It shows the server's `fields.reason` error.
   - It calls the module's existing `unarchive*Action`. No new restore endpoints.
2. **Use the same server permission for archive and restore** in every module, and tighten the four modules that use `requireInternalStaff()`: persons, immigration, engagements, and non-recruitment leads. Do this before the UI exposes either action more widely.
3. **The UI must mirror the server check exactly.** Each page computes `canRestore` with the same `checkPermission(business, module, verb)` triple that the service uses with `requirePermission`. Hide the button when it is false. The server stays the authority, and the e2e tests call the action directly to prove that.
4. **Archived banner.** Show "Archived 31 Oct 2026 · 12:10 by <name>: <reason>", read from the latest `ARCHIVED` audit event, which carries an absolute date and time. While the record is archived, hide Edit and all mutating actions (Add candidate, Run matching, New requisition, Archive).
5. **Shared server helper.** Add a `reasonSchema` (trimmed) and an `unarchiveRow(tx, table, id)` that locks the row and asserts `archived_at IS NOT NULL`. This removes C1–C3 everywhere in one change.
6. **Parent-state rule:** a child can't be restored while its parent is archived (requisition → employer; placement → requisition and person; case → beneficiary). The error message tells the user which parent to restore first.

## Do not expose Restore for a module until…

- [ ] Server archive **and** restore use the same module-level `requirePermission` (not `requireInternalStaff()`).
- [ ] The reason schema trims whitespace, and validation errors return `ValidationError` with a `reason` field (not `INTERNAL_ERROR`).
- [ ] Restore locks the row or updates conditionally, so a double restore gives `NOT_ARCHIVED` and writes only one audit row.
- [ ] Restore writes `UNARCHIVED` with `before.archivedAt`, `before.archivedByUserId`, and `context.reason`, in the same transaction as the update. This is already true apart from `archivedByUserId`.
- [ ] Parent-state checks are in place where they apply.
- [ ] **Placements only:** the seat and duplicate check runs before the restore, and the fill count and status are recomputed after it.
- [ ] **Persons only:** merged persons are refused, and the lifecycle "Archived" path is renamed or needs a reason.
- [ ] The UI `canRestore` uses the same permission triple as the server.
- [ ] The unit and e2e tests below pass.

Current status: **Campaigns ✅.** Employers and Requisitions are close: they need only the shared fixes plus the requisition's employer check. **Persons, Immigration, Placements, Leads and Engagements are not ready.**

---

## Test plan

Unit and integration tests use the existing vitest + real-DB style of `campaigns/r4.test.ts` and `placements/seat-guards.test.ts`. E2e tests use Playwright through the UI, plus direct server-action calls for the negative authorization checks.

### Shared scenarios (run for every module)

- **Happy path:** archive with reason "Duplicate record", then restore with reason "Archived by mistake".
  - `archivedAt` is null afterwards, and `archivedByUserId` is null where the column exists.
  - The `UNARCHIVED` audit row has `before.archivedAt` set and `context.reason === 'Archived by mistake'`.
  - The record shows in its default list again.
- **Not archived:** restoring a live record throws `NOT_ARCHIVED` and writes no audit row.
- **Missing or short reason:** a reason of `""`, `"ab"` or `"   "` gives `ValidationError` with `fields.reason`. The record stays archived and no audit row is written.
- **Reason too long:** 501 characters is refused.
- **Concurrency:** two parallel restores give exactly one success, one `NOT_ARCHIVED`, and one `UNARCHIVED` audit row.
- **Authorization denied:** a user without the module grant gets `AUTHORIZATION_ERROR`, an `AUTH_DENIED` audit row is written (`session.ts:21-44`), and the record stays archived.
- **Owner bypass:** an owner with no grants can restore.

### Per-module scenarios

| Module | Unit / integration | E2E |
|---|---|---|
| Persons | A STAFF user with no grants gets FORBIDDEN (after the permission fix). An archived-then-merged person is refused with `PERSON_MERGED`. A restored person is back in the pipeline (`pipeline/service.ts`), matching, the pickers and search. | Archive a candidate from the table, find them under Archived, restore with a reason; they reappear in the "Add candidate" picker on a job. FINANCE sees no Restore button, and a direct action call returns FORBIDDEN. |
| Employers | Staff without `employers.edit` (FINANCE preset) gets FORBIDDEN; RECRUITER succeeds. Restore does not change `status`; the case where `status='ARCHIVED'` is left as is is documented. | "A recruiter archives Sunrise Nursing Home by mistake; a manager restores it": it vanishes from All, shows at `/employers?status=archived` with "Archived 31 Oct 2026 · HH:MM by …", the banner hides Edit and New requisition, restore with a reason, and the audit page shows Unarchived with the reason. A FINANCE user sees no Restore button. |
| Immigration | FINANCE and zero-grant STAFF get FORBIDDEN (after the fix); DOCUMENT_SPECIALIST follows the proposal's decision. Restoring a case whose beneficiary is archived is refused or warned. | Archive a case from the detail overflow; the page shows the banner and Restore (not "Archive case" again); restore with a reason; it's back in the list. |
| Requisitions | Staff without `requisitions.edit` gets FORBIDDEN. Restoring under an archived employer is refused with `EMPLOYER_ARCHIVED`. While archived, `manuallyShortlistPersonAction` returns `REQUISITION_NOT_ACTIVE`. | Archive a job, open its URL: the banner shows, "Add candidate" is absent, then restore; it's back in the cards and the table. |
| Placements | A seat taken by a new placement while the old one was archived means restoring the old CONFIRMED one is refused with `REQUISITION_OVERFILLED`. Same person with a live placement on the same job gives `PLACEMENT_DUPLICATE`. After restoring a CONFIRMED placement into a free seat, `positions_filled` goes up by 1 and the status rolls up (FILLED / PARTIALLY_FILLED). A PROPOSED placement restores without a seat check. Under an archived requisition, restore is refused. Staff without `placements.edit` gets FORBIDDEN. | Archive a confirmed placement, confirm another candidate into the freed seat, try Restore on the first: the error toast names the full requisition. |
| Campaigns | Existing `r4.test.ts:336`. Add: FINANCE gets FORBIDDEN, and a `"   "` reason is refused. | Archived tab, open the campaign, Restore with a reason: the banner is gone and editing is allowed again. |
| Leads | A CS lead restored by a user without `candidate_services.leads.edit` gets FORBIDDEN (after the fix). A recruitment lead without `recruitment.leads.edit` gets FORBIDDEN (already enforced). | Archive a lead, find it under Archived, restore it. |
| Engagements | A user without `candidate_services.engagements.edit` gets FORBIDDEN (after the fix). A restored engagement reappears in the client workspace and transactions. | Archive an engagement from `/engagements`, restore it from the Archived filter, check that the outstanding balance is shown again. |
