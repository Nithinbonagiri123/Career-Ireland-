/**
 * P0 — when may a placement fee invoice be raised, and where does the
 * "Raise fee" link go. Pure so the employer page, the requisition Seats
 * tab, the /placements list and the employer next-action all agree.
 *
 * A fee is raisable only for a live (non-archived) CONFIRMED, STARTED or
 * COMPLETED placement that has no non-void invoice yet. An outstanding
 * (ISSUED / PARTIALLY_PAID) or PAID invoice blocks a second one; a VOIDED
 * invoice does not. The billing server re-checks this (W1's guard).
 */

export const FEE_BILLABLE_STATUSES = ['CONFIRMED', 'STARTED', 'COMPLETED'] as const;

/** Shown in place of a fee button for users without ISSUE finance authority. */
export const FINANCE_ISSUES_INVOICES = 'Finance issues invoices';

export type FeeRaisableInput = {
  status: string;
  archivedAt?: Date | string | null;
  /** True when any invoice linked to the placement is not VOIDED. */
  hasLiveInvoice: boolean;
};

export function isFeeBillableStatus(status: string): boolean {
  return (FEE_BILLABLE_STATUSES as readonly string[]).includes(status);
}

export function isPlacementFeeRaisable(p: FeeRaisableInput): boolean {
  return !p.archivedAt && isFeeBillableStatus(p.status) && !p.hasLiveInvoice;
}

export function raisePlacementFeeHref(p: {
  employerId: string;
  id: string;
  jobRequisitionId: string;
}): string {
  return `/employers/${p.employerId}?raisePlacement=${p.id}&raiseRequisition=${p.jobRequisitionId}`;
}

const PERIOD_SUFFIX: Record<string, string> = {
  ANNUAL: '/ year',
  MONTHLY: '/ month',
  WEEKLY: '/ week',
  HOURLY: '/ hour',
};

/** "/ year" etc. for a salary copied from an offer; empty when unknown. */
export function salaryPeriodSuffix(period: string | null | undefined): string {
  return period ? (PERIOD_SUFFIX[period] ?? '') : '';
}
