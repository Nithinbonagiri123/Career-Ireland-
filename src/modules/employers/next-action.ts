/**
 * Next-step state machine for an Employer record. Pure function; the
 * server page gathers the raw inputs and calls this. Same contract as
 * computeCandidateNextAction — see src/modules/candidates/next-action.ts.
 */

export type EmployerNextAction = {
  label: 'NEXT STEP';
  dueHint: string | null;
  sentence: string;
  tone: 'default' | 'urgent';
  primary: { label: string; href: string };
};

export type EmployerNextActionInput = {
  employerId: string;
  requisitions: Array<{
    id: string;
    title: string;
    status: string;
    positionsRequired: number;
    positionsFilled: number;
  }>;
  /** Placements made against this employer, with their latest fee
   *  invoice (null when no invoice has been raised yet). */
  placements: Array<{
    id: string;
    personName: string;
    jobRequisitionId: string;
    latestInvoice: { number: string; issuedAt: Date; outstandingAmount: string } | null;
    /** P0 — a fee can be raised now (CONFIRMED / STARTED / COMPLETED, not
     *  archived, no non-void invoice; see placements/fee.ts). Defaults to
     *  `latestInvoice == null` when omitted. */
    feeRaisable?: boolean;
  }>;
  /** P0 — the viewer may issue invoices (finance authority). When false the
   *  fee step points at the Billing tab instead of an action they can't do. */
  canIssueInvoice?: boolean;
  now?: Date;
};

const OVERDUE_DAYS = 14;

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

export function computeEmployerNextAction(
  input: EmployerNextActionInput,
): EmployerNextAction | null {
  const now = input.now ?? new Date();
  const { employerId, requisitions, placements } = input;

  const overduePlacement = placements.find(
    (p) =>
      p.latestInvoice != null &&
      Number.parseFloat(p.latestInvoice.outstandingAmount) > 0 &&
      daysBetween(now, p.latestInvoice.issuedAt) > OVERDUE_DAYS,
  );
  if (overduePlacement?.latestInvoice) {
    const days = daysBetween(now, overduePlacement.latestInvoice.issuedAt);
    return {
      label: 'NEXT STEP',
      dueHint: 'overdue',
      sentence: `Chase the overdue placement fee — invoice ${overduePlacement.latestInvoice.number} is ${days} days past due.`,
      tone: 'urgent',
      primary: {
        label: 'Open invoice',
        // R0 — used to link back to the page you were already on.
        href: `/employers/${employerId}/invoices/${overduePlacement.latestInvoice.number}`,
      },
    };
  }

  const uninvoicedPlacement = placements.find((p) => p.feeRaisable ?? p.latestInvoice == null);
  if (uninvoicedPlacement) {
    if (input.canIssueInvoice === false) {
      return {
        label: 'NEXT STEP',
        dueHint: null,
        sentence: `The placement fee for ${uninvoicedPlacement.personName} is ready to invoice — Finance issues invoices.`,
        tone: 'default',
        primary: { label: 'View billing', href: `/employers/${employerId}?tab=billing` },
      };
    }
    return {
      label: 'NEXT STEP',
      dueHint: null,
      sentence: `Raise the placement fee invoice for ${uninvoicedPlacement.personName}.`,
      tone: 'default',
      primary: {
        label: 'Raise placement fee',
        href: `/employers/${employerId}?raisePlacement=${uninvoicedPlacement.id}&raiseRequisition=${uninvoicedPlacement.jobRequisitionId}`,
      },
    };
  }

  const activeRequisitions = requisitions.filter(
    (r) => r.status !== 'CLOSED' && r.status !== 'CANCELLED' && r.status !== 'FILLED',
  );

  if (requisitions.length === 0) {
    return {
      label: 'NEXT STEP',
      dueHint: null,
      sentence: 'Create the first requisition so candidates can be sourced for this employer.',
      tone: 'default',
      primary: {
        label: 'New requisition',
        // R0 — ?newRequisition=1 opens the dialog instead of self-linking.
        href: `/employers/${employerId}?newRequisition=1`,
      },
    };
  }

  const openWithoutApplicants = activeRequisitions.find((r) => r.positionsFilled === 0);
  if (openWithoutApplicants) {
    return {
      label: 'NEXT STEP',
      dueHint: null,
      sentence: `Add candidates to ${openWithoutApplicants.title} — no positions filled yet.`,
      tone: 'default',
      primary: {
        label: 'Open requisition',
        href: `/requisitions/${openWithoutApplicants.id}`,
      },
    };
  }

  const partiallyFilled = activeRequisitions.find(
    (r) => r.positionsFilled > 0 && r.positionsFilled < r.positionsRequired,
  );
  if (partiallyFilled) {
    const remaining = partiallyFilled.positionsRequired - partiallyFilled.positionsFilled;
    return {
      label: 'NEXT STEP',
      dueHint: null,
      sentence: `Keep filling ${partiallyFilled.title} — ${remaining} position${remaining === 1 ? '' : 's'} to go.`,
      tone: 'default',
      primary: {
        label: 'Open requisition',
        href: `/requisitions/${partiallyFilled.id}`,
      },
    };
  }

  return null;
}
