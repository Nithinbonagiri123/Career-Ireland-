import { BusinessRuleError } from '@/lib/errors';

/**
 * Enforces valid status transitions for domain entities.
 * `transitions[from]` is the set of legal next states from `from`. States not listed as keys are terminal.
 *
 * Usage:
 *   const applicationFsm: TransitionMap<AppStatus> = { APPLIED: ['UNDER_REVIEW', ...], ... };
 *   assertTransition('job_application', current, next, applicationFsm);
 */
export type TransitionMap<S extends string> = Partial<Record<S, readonly S[]>>;

export function assertTransition<S extends string>(
  entityLabel: string,
  from: S,
  to: S,
  transitions: TransitionMap<S>,
): void {
  if (from === to) return;
  const allowed = transitions[from];
  if (!allowed?.includes(to)) {
    throw new BusinessRuleError(
      'INVALID_STATE_TRANSITION',
      `Cannot transition ${entityLabel} from ${from} to ${to}`,
    );
  }
}

// ─── Domain state machines ────────────────────────────────────────────────────

export const APPLICATION_TRANSITIONS = {
  APPLIED: ['UNDER_REVIEW', 'SHORTLISTED', 'INTERVIEW', 'REJECTED', 'WITHDRAWN'],
  UNDER_REVIEW: ['SHORTLISTED', 'INTERVIEW', 'REJECTED', 'WITHDRAWN'],
  SHORTLISTED: ['INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN'],
  INTERVIEW: ['OFFER', 'REJECTED', 'WITHDRAWN'],
  OFFER: ['ACCEPTED', 'REJECTED', 'WITHDRAWN'],
  ACCEPTED: ['WITHDRAWN'],
  REJECTED: ['WITHDRAWN'],
  // WITHDRAWN is fully terminal
} as const satisfies TransitionMap<
  | 'APPLIED'
  | 'UNDER_REVIEW'
  | 'SHORTLISTED'
  | 'INTERVIEW'
  | 'OFFER'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'WITHDRAWN'
>;

export const PLACEMENT_TRANSITIONS = {
  PROPOSED: ['CONFIRMED', 'TERMINATED_EARLY'],
  CONFIRMED: ['STARTED', 'TERMINATED_EARLY'],
  STARTED: ['COMPLETED', 'TERMINATED_EARLY'],
  // COMPLETED and TERMINATED_EARLY are terminal
} as const satisfies TransitionMap<
  'PROPOSED' | 'CONFIRMED' | 'STARTED' | 'COMPLETED' | 'TERMINATED_EARLY'
>;

export const REQUISITION_TRANSITIONS = {
  DRAFT: ['OPEN', 'CANCELLED'],
  OPEN: ['IN_PROGRESS', 'PARTIALLY_FILLED', 'FILLED', 'CLOSED', 'CANCELLED'],
  IN_PROGRESS: ['PARTIALLY_FILLED', 'FILLED', 'CLOSED', 'CANCELLED', 'OPEN'],
  PARTIALLY_FILLED: ['IN_PROGRESS', 'FILLED', 'CLOSED', 'CANCELLED'],
  FILLED: ['PARTIALLY_FILLED', 'CLOSED'],
  // CLOSED and CANCELLED are terminal
} as const satisfies TransitionMap<
  'DRAFT' | 'OPEN' | 'IN_PROGRESS' | 'PARTIALLY_FILLED' | 'FILLED' | 'CLOSED' | 'CANCELLED'
>;

export const IMMIGRATION_CASE_TRANSITIONS = {
  OPEN: ['DOCUMENTS_PENDING', 'SUBMITTED', 'CLOSED'],
  DOCUMENTS_PENDING: ['SUBMITTED', 'OPEN', 'CLOSED'],
  SUBMITTED: ['UNDER_AUTHORITY_REVIEW', 'DOCUMENTS_PENDING', 'CLOSED'],
  UNDER_AUTHORITY_REVIEW: ['APPROVED', 'REJECTED', 'DOCUMENTS_PENDING', 'CLOSED'],
  APPROVED: ['CLOSED'],
  REJECTED: ['SUBMITTED', 'CLOSED'],
  // CLOSED is terminal
} as const satisfies TransitionMap<
  | 'OPEN'
  | 'DOCUMENTS_PENDING'
  | 'SUBMITTED'
  | 'UNDER_AUTHORITY_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'CLOSED'
>;

export const INTERVIEW_TRANSITIONS = {
  SCHEDULED: ['COMPLETED', 'NO_SHOW', 'RESCHEDULED', 'CANCELLED'],
  RESCHEDULED: ['SCHEDULED', 'CANCELLED'],
  // COMPLETED / NO_SHOW / CANCELLED are terminal
} as const satisfies TransitionMap<
  'SCHEDULED' | 'COMPLETED' | 'NO_SHOW' | 'RESCHEDULED' | 'CANCELLED'
>;

export const OFFER_TRANSITIONS = {
  DRAFT: ['SENT', 'WITHDRAWN'],
  SENT: ['NEGOTIATING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED'],
  NEGOTIATING: ['SENT', 'REJECTED', 'WITHDRAWN'],
  // ACCEPTED / REJECTED / WITHDRAWN / EXPIRED are terminal
} as const satisfies TransitionMap<
  'DRAFT' | 'SENT' | 'NEGOTIATING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN' | 'EXPIRED'
>;

export const LEAD_TRANSITIONS = {
  NEW: ['CONTACTED', 'AWAITING_PAYMENT', 'LOST', 'REJECTED'],
  CONTACTED: ['AWAITING_PAYMENT', 'CONVERTED', 'LOST', 'REJECTED'],
  AWAITING_PAYMENT: ['CONVERTED', 'LOST', 'REJECTED'],
  LOST: ['CONTACTED', 'AWAITING_PAYMENT'],
  REJECTED: ['CONTACTED'],
  // CONVERTED is fully terminal
} as const satisfies TransitionMap<
  'NEW' | 'CONTACTED' | 'AWAITING_PAYMENT' | 'CONVERTED' | 'LOST' | 'REJECTED'
>;
