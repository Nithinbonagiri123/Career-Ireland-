import type { CandidateProfile } from '@/lib/db/schema/persons';

/**
 * The one thing a user should do next on a Candidate record. Computed
 * server-side from the data the Candidate detail page already loads, so
 * no additional round-trip is needed. Returns null when there's nothing
 * pressing — the card then renders nothing, and the record page is
 * uncluttered.
 *
 * Rule for picking which action wins when multiple are pending:
 * urgency. Overdue beats open; "paid but not progressed" beats
 * "service running smoothly". The priority order lives in
 * computeCandidateNextAction below and is the only place to change it.
 */
export type CandidateNextAction = {
  /** Eyebrow label — always "NEXT STEP" for candidates; kept configurable
   *  on the primitive so other records (employer, case) can relabel. */
  label: 'NEXT STEP';
  /** Short qualifier shown after the label, e.g. "due today", "overdue".
   *  null when the step is open-ended. */
  dueHint: string | null;
  /** The verb-first sentence describing the step. ≤ 90 chars so the row
   *  stays one visual line on desktop. */
  sentence: string;
  /** One of two visual weights. "default" is the standard quiet treatment.
   *  "urgent" nudges the eyebrow + button into the warning tone — reserved
   *  for genuinely time-sensitive states (overdue invoice). */
  tone: 'default' | 'urgent';
  /** The single primary action. Always a navigable href (not a dialog
   *  trigger) so the card primitive can stay pure markup. */
  primary: { label: string; href: string };
};

/** Input shape — exactly what the Candidate page already has in scope. */
export type CandidateNextActionInput = {
  personId: string;
  candidateProfile: Pick<CandidateProfile, 'availabilityStatus' | 'lifecycleStatus'> | null;
  leads: Array<{ status: string }>;
  engagements: Array<{ id: string; status: string; archivedAt: Date | null }>;
  invoices: Array<{
    number: string;
    outstandingAmount: string;
    totalAmount: string;
    issuedAt: Date;
  }>;
  /** Pass through for testability; defaults to now. */
  now?: Date;
};

const OVERDUE_DAYS = 14;

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

export function computeCandidateNextAction(
  input: CandidateNextActionInput,
): CandidateNextAction | null {
  const now = input.now ?? new Date();
  const { personId, candidateProfile, leads, engagements, invoices } = input;

  const outstandingInvoices = invoices
    .filter((i) => Number.parseFloat(i.outstandingAmount) > 0)
    .sort((a, b) => a.issuedAt.getTime() - b.issuedAt.getTime());

  const overdueInvoice = outstandingInvoices.find(
    (i) => daysBetween(now, i.issuedAt) > OVERDUE_DAYS,
  );
  if (overdueInvoice) {
    const days = daysBetween(now, overdueInvoice.issuedAt);
    return {
      label: 'NEXT STEP',
      dueHint: 'overdue',
      sentence: `Chase the overdue payment — invoice ${overdueInvoice.number} is ${days} days past due.`,
      tone: 'urgent',
      primary: {
        label: 'Open invoice',
        href: `/candidates/${personId}/invoices/${overdueInvoice.number}`,
      },
    };
  }

  if (outstandingInvoices.length > 0) {
    const i = outstandingInvoices[0];
    return {
      label: 'NEXT STEP',
      dueHint: null,
      sentence: `Record the payment when it arrives — invoice ${i.number} is still outstanding.`,
      tone: 'default',
      primary: {
        label: 'Open invoice',
        href: `/candidates/${personId}/invoices/${i.number}`,
      },
    };
  }

  const liveEngagements = engagements.filter((e) => e.archivedAt == null);
  const pendingEngagement = liveEngagements.find(
    (e) => e.status === 'REQUESTED' || e.status === 'PENDING_PAYMENT',
  );
  if (pendingEngagement) {
    return {
      label: 'NEXT STEP',
      dueHint: null,
      sentence: 'Payment is cleared — advance the service to Active.',
      tone: 'default',
      primary: { label: 'Open billing', href: `/candidates/${personId}?tab=billing` },
    };
  }

  const activeEngagement = liveEngagements.find((e) => e.status === 'ACTIVE');
  if (activeEngagement) {
    return {
      label: 'NEXT STEP',
      dueHint: null,
      sentence: 'Service is in progress — update the engagement when the next deliverable ships.',
      tone: 'default',
      primary: { label: 'Open billing', href: `/candidates/${personId}?tab=billing` },
    };
  }

  const completedEngagement = liveEngagements.find((e) => e.status === 'COMPLETED');
  if (
    completedEngagement &&
    candidateProfile &&
    candidateProfile.availabilityStatus !== 'AVAILABLE'
  ) {
    return {
      label: 'NEXT STEP',
      dueHint: null,
      sentence: 'Return the candidate to the pool — mark them Available again.',
      tone: 'default',
      primary: { label: 'Edit candidate', href: `/candidates/${personId}` },
    };
  }

  const openLead = leads.find(
    (l) => l.status === 'NEW' || l.status === 'CONTACTED' || l.status === 'AWAITING_PAYMENT',
  );
  if (openLead && !candidateProfile) {
    return {
      label: 'NEXT STEP',
      dueHint: null,
      sentence: 'Issue the first invoice to open the service engagement.',
      tone: 'default',
      primary: { label: 'Create invoice', href: `/candidates/${personId}?tab=billing` },
    };
  }

  return null;
}
