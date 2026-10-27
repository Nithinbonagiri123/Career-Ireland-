import type { UserRole } from '@/lib/db/schema/users';

/**
 * The single definition of who may do what with money. Pure (no I/O) so
 * it can be unit-tested exhaustively and imported anywhere.
 *
 *   PREPARE — draft quotes, record a payment as PENDING, accept a lead,
 *             save an onboarding draft. Any internal staff member; the
 *             existing per-module grants still apply on top.
 *   ISSUE   — issue an official invoice.
 *   VERIFY  — confirm money as received (VERIFIED), reject a payment,
 *             finalise an intake that includes a payment.
 *   REVERSE — void, credit note, refund, waive (complimentary service).
 *
 * ISSUE / VERIFY / REVERSE require finance authority: the business owner,
 * or role ADMIN or FINANCE. Each tier is its own entry so a later change
 * (e.g. FINANCE may verify but not refund) is a one-line edit here.
 */
export const FINANCE_TIERS = ['PREPARE', 'ISSUE', 'VERIFY', 'REVERSE'] as const;
export type FinanceTier = (typeof FINANCE_TIERS)[number];

export type FinanceActor = { role: UserRole; isOwner: boolean; isActive?: boolean };

const INTERNAL_ROLES: ReadonlySet<UserRole> = new Set<UserRole>([
  'ADMIN',
  'STAFF',
  'MANAGER',
  'RECRUITER',
  'DOCUMENT_SPECIALIST',
  'FINANCE',
]);

const FINANCE_AUTHORITY_ROLES: ReadonlySet<UserRole> = new Set<UserRole>(['ADMIN', 'FINANCE']);

const TIER_ROLES: Record<FinanceTier, ReadonlySet<UserRole>> = {
  PREPARE: INTERNAL_ROLES,
  ISSUE: FINANCE_AUTHORITY_ROLES,
  VERIFY: FINANCE_AUTHORITY_ROLES,
  REVERSE: FINANCE_AUTHORITY_ROLES,
};

export function hasFinanceAuthority(actor: FinanceActor, tier: FinanceTier): boolean {
  if (actor.isActive === false) return false;
  // Owner authority (decision B1) — but only for internal users; a legacy
  // portal role can never hold money authority even if flagged.
  if (actor.isOwner && INTERNAL_ROLES.has(actor.role)) return true;
  return TIER_ROLES[tier].has(actor.role);
}

export const FINANCE_DENIAL_MESSAGES: Record<FinanceTier, string> = {
  PREPARE: 'Your account cannot prepare financial records.',
  ISSUE: 'Issuing an invoice is restricted to Finance, Admin or the owner.',
  VERIFY: 'Confirming or rejecting money is restricted to Finance, Admin or the owner.',
  REVERSE:
    'Voids, credit notes, refunds and complimentary waivers are restricted to Finance, Admin or the owner.',
};
