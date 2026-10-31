# Recruitment — owner decisions for P1

Recorded 31 October 2026 (owner, after P0 acceptance review). These set
the direction for the P1 Recruitment work. P1 itself is **on hold** until
separately approved; nothing below is implemented yet unless marked.

| # | Decision | What it means for P1 | Today (after P0) |
|---|---|---|---|
| 1 | **Recruitment enquiries do not require upfront payment.** | Converting a Recruitment lead creates the job without a payment step. An optional retainer invoice can still be linked ("use an existing invoice"). Finance keeps sole control of issuing and verifying invoices; conversion never verifies money on its own. | Conversion still requires a payment or a paid, verified existing invoice (P0 kept the old rule). |
| 2 | **New jobs default to Draft, with "Create & Open" available.** | The New job dialog keeps Draft as the default and adds a second primary action that creates the job as Open in one step. Draft jobs keep the "Open this job before adding or moving candidates" guard and gain a one-click "Open job" action. | Draft default; opening needs Edit → Admin → Status. |
| 3 | **Active employer status is separate from archive state.** | Archive/restore uses `archivedAt` only. The "Archived" option is removed from the employer status picker; status (Prospect / Active / On hold) describes the relationship, not visibility. Billing setup readiness stays separate from both. | Two archive concepts exist (status = Archived and `archivedAt`). |
| 4 | **Restore requires existing appropriate authorization, a reason and audit logging.** | Restore buttons appear only after each module's restore action passes the readiness checklist in `docs/archive-restore-readiness.md` (same permission as archive, trimmed reason required, idempotent, audited, dependent effects such as seat counts recomputed). | Server restore actions exist; only Campaigns is ready; no new Restore buttons were exposed. |
| 5 | **Recruiter billing visibility must not automatically expose full financial records.** | Recruiters see status only (e.g. "Fee invoiced" / "Not invoiced"), not amounts, invoice documents or payment trails, unless they hold finance read. Implemented through the prepared billing-read change (existing finance-read authority; no new grants). | All internal staff can read billing; change prepared, not applied. |
| 6 | **Preserve current placement-fee pricing until verified.** | No automatic fee calculation. Placement Fee keeps whatever the catalog defines today (see the pricing note in `docs/placement-invoice-constraint-assessment.md`); manual amounts stay manual. | Unchanged. |
| 7 | Campaigns: two types only (talent pool, or for one eligible job; employer derived from the job). | — | **Implemented in P0.** |
| 8 | Isolated local manual-testing database. | Guards implemented; database creation and migration await a specific approval (`docs/manual-test-database-plan.md`). | Partially implemented (guards only). |
