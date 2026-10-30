# Permissions review: payment verification and refund button visibility

Status: open — documented during the Stage 6G Candidate Services redesign
(October 2026). The redesign deliberately **preserved** every rule below
unchanged; this note exists so the inconsistencies can be reviewed and
fixed in a separate, permissions-focused change.

## Server-side rule (the actual safeguard)

`verifyPayment` and `rejectPayment` (`src/modules/commerce/service.ts`)
both call `requireFinanceAuthority('VERIFY', …)`. Per
`src/lib/auth/finance-policy-rules.ts`, the VERIFY tier is held by:

- an active user with role `ADMIN` or `FINANCE`, or
- an active business owner (`isOwner = true`) whose role is one of the
  internal roles: `ADMIN`, `STAFF`, `MANAGER`, `RECRUITER`,
  `DOCUMENT_SPECIALIST` or `FINANCE`. An owner flag on any other (legacy
  portal) role grants nothing.

A deactivated user (`isActive = false`) never has this authority. Anyone
else is refused and an `AUTH_DENIED` audit row is written. **No
screen can let an unauthorised user verify money**; the differences below
are only about who *sees* the button.

## Where the "Verify payment" control appears, and who sees it

| Screen | File | Shown to | Matches server rule? |
|---|---|---|---|
| Payments workspace (Verify / Reject menu) | `src/app/(app)/payments/payments-workspace.tsx` (`canDecide`) | role `ADMIN` only | No — hides it from FINANCE and the owner, who are allowed |
| Client workspace, Service billing payments | `src/app/(app)/clients/[personId]/page.tsx` (frozen file) using `canVerifyPayments` from `src/modules/clients/workspace-data.ts` | owner, or anyone with `candidate_services.proformas.edit` | No — a non-finance user with `proformas.edit` sees the button but the server refuses; a FINANCE user without `proformas.edit` sees "Finance will confirm" instead |
| Pro-forma detail | `src/app/(app)/leads/[id]/pro-formas/[pfId]/page.tsx` | everyone who can open the page (`candidate_services.proformas.view`) — no UI gate | No — shown to users the server will refuse |
| Employer billing history (record payment dialog, "Record + verify" option) | `src/app/(app)/employers/[id]/page.tsx` (`canVerifyPayments`) → `BillingSection` | role `ADMIN` or `FINANCE` | Partly — omits the owner |
| Job billing, Immigration case billing | `requisitions/[id]/page.tsx`, `immigration/[id]/page.tsx` | nobody (`canVerify={false}`) | Stricter than the server (by design: verify from the payer's own billing) |

## Pre-issuance refund button

| Screen | Shown to |
|---|---|
| Pro-forma detail (`[pfId]/page.tsx`, `canRefund`) | owner, `ADMIN`, `FINANCE` |
| Client workspace (`clients/[personId]/page.tsx`, `canPreIssuanceRefund`, frozen file) | anyone, when the pro forma and payment states allow — no role check in the UI |

The refund server action enforces finance authority itself.

## Suggested direction (not implemented)

Use one helper for the UI decision — `canFinance('VERIFY')` /
`hasFinanceAuthority(user, 'VERIFY')` from `src/lib/auth/finance-policy.ts`
— on every screen, so the button is shown exactly to the people the server
accepts. The client workspace changes require the frozen Close Case file to
be accepted first.
