/**
 * The "Next action" prompt for the unified Client Workspace.
 *
 * Candidate activation and invoice settlement are deliberately separate
 * operations — the resolver surfaces each in turn, driven by the most
 * recent legal state. Priority order is urgency, not journey order: an
 * overdue invoice beats an open quote; a pending finance confirmation
 * beats an unissued draft.
 *
 * The resolver is pure. All inputs come from the workspace data loader;
 * no DB access here. Tested exhaustively in next-action.test.ts so a
 * state matrix regression is caught long before the UI.
 */
export type ClientNextAction = {
  label: 'NEXT STEP';
  /** Short qualifier shown after the eyebrow. Null for open-ended steps. */
  dueHint: string | null;
  /** One-sentence verb-first instruction. ≤ 100 chars. */
  sentence: string;
  tone: 'default' | 'urgent' | 'muted';
  /** Primary CTA. `kind: 'link'` is a plain navigation; `kind: 'dialog'`
   *  signals the UI to open a named dialog instead (keeps the resolver
   *  free of UI concerns while giving the workspace a hint). */
  primary:
    | { kind: 'link'; label: string; href: string }
    | { kind: 'dialog'; label: string; dialog: ClientDialog }
    | { kind: 'disabled'; label: string; reason: string };
};

export type ClientDialog =
  | 'create-quote'
  | 'issue-quote'
  | 'mark-accepted'
  | 'record-payment'
  | 'activate-candidate';

export type ClientNextActionInput = {
  personId: string;
  canVerifyPayments: boolean;
  hasCandidateProfile: boolean;
  availabilityStatus: 'AVAILABLE' | 'TEMPORARILY_UNAVAILABLE' | 'PLACED' | null;
  leads: Array<{
    id: string;
    status:
      | 'NEW'
      | 'CONTACTED'
      | 'AWAITING_PAYMENT'
      | 'CONVERTED'
      | 'LOST'
      | 'REJECTED'
      | 'EXPIRED'
      | 'ARCHIVED';
    targetBusiness: 'CANDIDATE_SERVICES' | 'RECRUITMENT' | 'IMMIGRATION';
  }>;
  proFormas: Array<{
    id: string;
    number: string;
    status: 'DRAFT' | 'ISSUED' | 'ACCEPTED' | 'CONVERTED' | 'REJECTED' | 'CANCELLED' | 'SUPERSEDED';
    sourceLeadId: string;
  }>;
  payments: Array<{
    status:
      | 'PENDING'
      | 'PROOF_UPLOADED'
      | 'VERIFIED'
      | 'REJECTED'
      | 'PARTIALLY_REFUNDED'
      | 'REFUNDED';
  }>;
  invoices: Array<{
    number: string;
    status: 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'VOIDED';
    outstandingAmount: string;
    issuedAt: Date;
  }>;
  engagements: Array<{
    id: string;
    status: 'REQUESTED' | 'PENDING_PAYMENT' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';
    archivedAt: Date | null;
  }>;
  /** Pass through for testability; defaults to now. */
  now?: Date;
};

const OVERDUE_DAYS = 14;
const dayMs = 24 * 60 * 60 * 1000;

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / dayMs);
}

export function computeClientNextAction(input: ClientNextActionInput): ClientNextAction | null {
  const now = input.now ?? new Date();
  const {
    personId,
    canVerifyPayments,
    hasCandidateProfile,
    availabilityStatus,
    leads,
    proFormas,
    payments,
    invoices,
    engagements,
  } = input;

  // 1. Overdue invoices come first — someone else's money has been
  //    expected for two weeks.
  const outstandingInvoices = invoices
    .filter((i) => i.status !== 'VOIDED' && Number.parseFloat(i.outstandingAmount) > 0)
    .sort((a, b) => a.issuedAt.getTime() - b.issuedAt.getTime());
  const overdueInvoice = outstandingInvoices.find(
    (i) => daysBetween(now, i.issuedAt) > OVERDUE_DAYS,
  );
  if (overdueInvoice) {
    const days = daysBetween(now, overdueInvoice.issuedAt);
    return {
      label: 'NEXT STEP',
      dueHint: 'overdue',
      sentence: `Chase overdue payment — invoice ${overdueInvoice.number} is ${days} days past due.`,
      tone: 'urgent',
      primary: {
        kind: 'link',
        label: 'View invoice',
        href: `/candidates/${personId}/invoices/${overdueInvoice.number}`,
      },
    };
  }

  // 2. A payment is sitting unverified. Finance sees "Confirm"; everyone
  //    else sees a muted "Awaiting finance confirmation".
  const unverifiedPayment = payments.find(
    (p) => p.status === 'PENDING' || p.status === 'PROOF_UPLOADED',
  );
  if (unverifiedPayment) {
    const acceptedForPayment = proFormas.find((p) => p.status === 'ACCEPTED');
    const paymentHref = acceptedForPayment
      ? `/leads/${acceptedForPayment.sourceLeadId}/pro-formas/${acceptedForPayment.id}`
      : `/clients/${personId}?tab=billing`;
    if (canVerifyPayments) {
      return {
        label: 'NEXT STEP',
        dueHint: null,
        sentence: 'A payment is awaiting finance confirmation.',
        tone: 'default',
        primary: { kind: 'link', label: 'Confirm payment received', href: paymentHref },
      };
    }
    return {
      label: 'NEXT STEP',
      dueHint: null,
      sentence: 'Finance is confirming the payment.',
      tone: 'muted',
      primary: {
        kind: 'disabled',
        label: 'Awaiting finance confirmation',
        reason: 'Only Finance or Admin can confirm payments received.',
      },
    };
  }

  // 3. Accepted quote with no payment recorded yet → record payment.
  const acceptedPf = proFormas.find((p) => p.status === 'ACCEPTED');
  if (acceptedPf && payments.length === 0) {
    return {
      label: 'NEXT STEP',
      dueHint: null,
      sentence: `Client accepted quote ${acceptedPf.number} — record the payment when it arrives.`,
      tone: 'default',
      primary: {
        kind: 'link',
        label: 'Record payment',
        href: `/leads/${acceptedPf.sourceLeadId}/pro-formas/${acceptedPf.id}`,
      },
    };
  }

  // 4. Verified payment + no candidate profile yet → activate candidate.
  //    This is the deliberate split from acceptLead: activation is a
  //    pure operation that doesn't touch money.
  const hasVerifiedPayment = payments.some(
    (p) => p.status === 'VERIFIED' || p.status === 'PARTIALLY_REFUNDED' || p.status === 'REFUNDED',
  );
  const csLead = leads.find((l) => l.targetBusiness === 'CANDIDATE_SERVICES');
  if (hasVerifiedPayment && csLead && !hasCandidateProfile) {
    return {
      label: 'NEXT STEP',
      dueHint: null,
      sentence: 'Payment received — activate the candidate to open their file.',
      tone: 'default',
      primary: { kind: 'dialog', label: 'Activate candidate', dialog: 'activate-candidate' },
    };
  }

  // 5. Outstanding invoice (not yet overdue) → record payment.
  if (outstandingInvoices.length > 0) {
    const i = outstandingInvoices[0];
    return {
      label: 'NEXT STEP',
      dueHint: null,
      sentence: `Invoice ${i.number} is outstanding — record payment when it arrives.`,
      tone: 'default',
      primary: { kind: 'dialog', label: 'Record payment', dialog: 'record-payment' },
    };
  }

  // 6. Issued quote waiting on client acceptance.
  const issuedPf = proFormas.find((p) => p.status === 'ISSUED');
  if (issuedPf) {
    return {
      label: 'NEXT STEP',
      dueHint: null,
      sentence: `Quote ${issuedPf.number} is with the client — mark it accepted when they confirm.`,
      tone: 'default',
      primary: {
        kind: 'link',
        label: 'Mark as accepted',
        href: `/leads/${issuedPf.sourceLeadId}/pro-formas/${issuedPf.id}`,
      },
    };
  }

  // 7. Draft quote → issue it.
  const draftPf = proFormas.find((p) => p.status === 'DRAFT');
  if (draftPf) {
    return {
      label: 'NEXT STEP',
      dueHint: null,
      sentence: `Draft quote ${draftPf.number} is ready — issue it to the client.`,
      tone: 'default',
      primary: {
        kind: 'link',
        label: 'Open draft',
        href: `/leads/${draftPf.sourceLeadId}/pro-formas/${draftPf.id}`,
      },
    };
  }

  // 8. Open lead with no quotes yet → create quote.
  const openLead = leads.find(
    (l) =>
      l.targetBusiness === 'CANDIDATE_SERVICES' &&
      (l.status === 'NEW' || l.status === 'CONTACTED' || l.status === 'AWAITING_PAYMENT'),
  );
  if (openLead && proFormas.length === 0) {
    return {
      label: 'NEXT STEP',
      dueHint: null,
      sentence: 'Create the first quote for this enquiry.',
      tone: 'default',
      primary: {
        kind: 'link',
        label: 'Create quote',
        href: `/leads/${openLead.id}`,
      },
    };
  }

  // 9. Engagement management (post-activation lifecycle).
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
      primary: {
        kind: 'link',
        label: 'Open billing',
        href: `/clients/${personId}?tab=billing`,
      },
    };
  }

  const completedEngagement = liveEngagements.find((e) => e.status === 'COMPLETED');
  if (
    completedEngagement &&
    hasCandidateProfile &&
    availabilityStatus &&
    availabilityStatus !== 'AVAILABLE'
  ) {
    return {
      label: 'NEXT STEP',
      dueHint: null,
      sentence: 'Service complete — return the candidate to the Available pool.',
      tone: 'default',
      primary: {
        kind: 'link',
        label: 'Edit candidate',
        href: `/clients/${personId}`,
      },
    };
  }

  return null;
}
