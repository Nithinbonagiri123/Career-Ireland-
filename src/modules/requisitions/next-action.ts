/**
 * Next-step state machine for a Requisition record. Pure function; see
 * src/modules/candidates/next-action.ts for the shared contract and
 * rationale.
 */

export type RequisitionNextAction = {
  label: 'NEXT STEP';
  dueHint: string | null;
  sentence: string;
  tone: 'default' | 'urgent';
  primary: { label: string; href: string };
};

export type RequisitionNextActionInput = {
  requisitionId: string;
  status: string;
  positionsRequired: number;
  positionsFilled: number;
  /** Pipeline counts per stage. Only the stages that affect the next
   *  step are consumed here — everything else is noise for this call. */
  pipelineCounts: {
    source: number;
    review: number;
    shortlist: number;
    apply: number;
    interview: number;
    offer: number;
    placed: number;
  };
};

export function computeRequisitionNextAction(
  input: RequisitionNextActionInput,
): RequisitionNextAction | null {
  const { requisitionId, status, positionsRequired, positionsFilled, pipelineCounts } = input;

  if (status === 'CLOSED' || status === 'CANCELLED') return null;

  if (status === 'DRAFT') {
    return {
      label: 'NEXT STEP',
      dueHint: null,
      sentence: 'Open this requisition so recruiters can start sourcing.',
      tone: 'default',
      primary: { label: 'Open & edit', href: `/requisitions/${requisitionId}` },
    };
  }

  if (status === 'FILLED' || positionsFilled >= positionsRequired) {
    return {
      label: 'NEXT STEP',
      dueHint: null,
      sentence: 'All positions filled — close the requisition.',
      tone: 'default',
      primary: { label: 'Open & close', href: `/requisitions/${requisitionId}` },
    };
  }

  if (pipelineCounts.offer > 0) {
    return {
      label: 'NEXT STEP',
      dueHint: null,
      sentence: 'A candidate is at offer stage — mark them placed when the offer is accepted.',
      tone: 'default',
      primary: { label: 'Open pipeline', href: `/requisitions/${requisitionId}?tab=pipeline` },
    };
  }

  const laterStageTotal =
    pipelineCounts.shortlist +
    pipelineCounts.apply +
    pipelineCounts.interview +
    pipelineCounts.placed;
  if (laterStageTotal > 0) {
    return {
      label: 'NEXT STEP',
      dueHint: null,
      sentence: 'Advance candidates through the pipeline toward offer.',
      tone: 'default',
      primary: { label: 'Open pipeline', href: `/requisitions/${requisitionId}?tab=pipeline` },
    };
  }

  const earlyTotal = pipelineCounts.source + pipelineCounts.review;
  if (earlyTotal > 0) {
    return {
      label: 'NEXT STEP',
      dueHint: null,
      sentence: 'Review the sourced candidates and shortlist the best fits.',
      tone: 'default',
      primary: { label: 'Open pipeline', href: `/requisitions/${requisitionId}?tab=pipeline` },
    };
  }

  return {
    label: 'NEXT STEP',
    dueHint: null,
    sentence: 'Nobody in the pipeline yet — add the first candidate.',
    tone: 'default',
    primary: { label: 'Open requisition', href: `/requisitions/${requisitionId}` },
  };
}
