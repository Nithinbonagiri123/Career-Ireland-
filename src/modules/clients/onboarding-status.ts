/**
 * Stage 6F Phase 4 — single derived primary onboarding status.
 *
 * The product owner complained operators had to interpret overlapping
 * secondary statuses ("Quote accepted" + "Awaiting finance" + "Invoice
 * issued" + "Candidate ready to activate" + "Lead converted") shown as
 * competing primary actions. This helper collapses the whole set into
 * ONE badge derived from authoritative records in a strict priority
 * order, so the workspace header carries one truthful headline. The
 * detailed per-record statuses still live where they belong (per quote,
 * per invoice, per payment, per engagement) — just not as competing
 * primary actions.
 *
 * Priority order (first match wins):
 *   1. Active candidate            — candidate_profiles.lifecycleStatus = ACTIVE
 *   2. Payment pending verification — any payment in PENDING / PROOF_UPLOADED
 *   3. Partially paid               — ACCEPTED pro forma with some VERIFIED
 *                                       payments but not yet fully paid
 *   4. Awaiting payment             — ACCEPTED pro forma, no verified payments yet
 *   5. Awaiting client acceptance   — ISSUED pro forma not yet ACCEPTED
 *   6. Preparing quote              — DRAFT pro forma OR open lead with no quote
 *   7. Lead closed                  — LOST / REJECTED / EXPIRED / ARCHIVED
 *   8. New enquiry                  — fallback
 *
 * Pure function — no I/O. Easy to unit test and safe to call during
 * SSR without database round-trips.
 */

export type PrimaryOnboardingStatus =
  | 'ACTIVE_CANDIDATE'
  | 'PAYMENT_PENDING_VERIFICATION'
  | 'PARTIALLY_PAID'
  | 'AWAITING_PAYMENT'
  | 'AWAITING_CLIENT_ACCEPTANCE'
  | 'PREPARING_QUOTE'
  | 'LEAD_CLOSED'
  | 'NEW_ENQUIRY';

export type PrimaryStatusTone = 'success' | 'info' | 'warning' | 'neutral' | 'danger';

export const PRIMARY_STATUS_LABEL: Record<PrimaryOnboardingStatus, string> = {
  ACTIVE_CANDIDATE: 'Active candidate',
  PAYMENT_PENDING_VERIFICATION: 'Payment pending verification',
  PARTIALLY_PAID: 'Partially paid',
  AWAITING_PAYMENT: 'Awaiting payment',
  AWAITING_CLIENT_ACCEPTANCE: 'Awaiting client acceptance',
  PREPARING_QUOTE: 'Preparing quote',
  LEAD_CLOSED: 'Lead closed',
  NEW_ENQUIRY: 'New enquiry',
};

export const PRIMARY_STATUS_TONE: Record<PrimaryOnboardingStatus, PrimaryStatusTone> = {
  ACTIVE_CANDIDATE: 'success',
  PAYMENT_PENDING_VERIFICATION: 'info',
  PARTIALLY_PAID: 'warning',
  AWAITING_PAYMENT: 'warning',
  AWAITING_CLIENT_ACCEPTANCE: 'info',
  PREPARING_QUOTE: 'neutral',
  LEAD_CLOSED: 'neutral',
  NEW_ENQUIRY: 'neutral',
};

export type PrimaryStatusInputs = {
  candidateProfile: { lifecycleStatus: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED' } | null | undefined;
  leads: ReadonlyArray<{
    status:
      | 'NEW'
      | 'CONTACTED'
      | 'AWAITING_PAYMENT'
      | 'CONVERTED'
      | 'LOST'
      | 'REJECTED'
      | 'EXPIRED'
      | 'ARCHIVED';
    targetBusiness: 'CANDIDATE_SERVICES' | 'IMMIGRATION' | 'RECRUITMENT';
  }>;
  proFormas: ReadonlyArray<{
    status: 'DRAFT' | 'ISSUED' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED' | 'CONVERTED' | 'SUPERSEDED';
  }>;
  payments: ReadonlyArray<{
    status:
      | 'PENDING'
      | 'PROOF_UPLOADED'
      | 'VERIFIED'
      | 'REJECTED'
      | 'PARTIALLY_REFUNDED'
      | 'REFUNDED';
    proFormaInvoiceId: string | null;
  }>;
};

export function derivePrimaryOnboardingStatus(i: PrimaryStatusInputs): PrimaryOnboardingStatus {
  // 1. The person is already a working candidate — nothing else beats this.
  if (i.candidateProfile?.lifecycleStatus === 'ACTIVE') return 'ACTIVE_CANDIDATE';

  // 2. A payment is awaiting finance verification — operators need to
  //    see this ahead of any quote-level state so the queue doesn't
  //    silently pile up.
  if (i.payments.some((p) => p.status === 'PENDING' || p.status === 'PROOF_UPLOADED')) {
    return 'PAYMENT_PENDING_VERIFICATION';
  }

  // 3. Partially paid — an ACCEPTED pro forma has at least one VERIFIED
  //    payment but hasn't crossed the full-paid threshold (if it had,
  //    the activation flow would have moved candidateProfile to ACTIVE
  //    and we'd have returned at step 1).
  const hasAcceptedPf = i.proFormas.some((pf) => pf.status === 'ACCEPTED');
  const hasVerifiedPaymentOnPf = i.payments.some(
    (p) => p.proFormaInvoiceId != null && p.status === 'VERIFIED',
  );
  if (hasAcceptedPf && hasVerifiedPaymentOnPf) return 'PARTIALLY_PAID';

  // 4. An ACCEPTED pro forma with no payments at all yet — the client
  //    has agreed but money hasn't arrived.
  if (hasAcceptedPf) return 'AWAITING_PAYMENT';

  // 5. ISSUED pro forma, client hasn't accepted yet.
  if (i.proFormas.some((pf) => pf.status === 'ISSUED')) return 'AWAITING_CLIENT_ACCEPTANCE';

  // 6. DRAFT pro forma, or an open lead with no quote in flight.
  const hasOpenLead = i.leads.some(
    (l) =>
      l.targetBusiness === 'CANDIDATE_SERVICES' &&
      l.status !== 'CONVERTED' &&
      l.status !== 'LOST' &&
      l.status !== 'REJECTED' &&
      l.status !== 'EXPIRED' &&
      l.status !== 'ARCHIVED',
  );
  if (i.proFormas.some((pf) => pf.status === 'DRAFT') || hasOpenLead) return 'PREPARING_QUOTE';

  // 7. Any CS lead in a terminal non-converted state.
  const closedLead = i.leads.find(
    (l) =>
      l.targetBusiness === 'CANDIDATE_SERVICES' &&
      (l.status === 'LOST' ||
        l.status === 'REJECTED' ||
        l.status === 'EXPIRED' ||
        l.status === 'ARCHIVED'),
  );
  if (closedLead) return 'LEAD_CLOSED';

  // 8. Fallback.
  return 'NEW_ENQUIRY';
}
