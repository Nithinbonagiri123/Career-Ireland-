import { describe, expect, it } from 'vitest';
import { computeRequisitionNextAction } from './next-action';

const REQ_ID = '00000000-0000-0000-0000-000000000020';

const EMPTY_PIPELINE = {
  source: 0,
  review: 0,
  shortlist: 0,
  apply: 0,
  interview: 0,
  offer: 0,
  placed: 0,
};

describe('computeRequisitionNextAction', () => {
  it('returns null for CLOSED or CANCELLED', () => {
    for (const status of ['CLOSED', 'CANCELLED']) {
      expect(
        computeRequisitionNextAction({
          requisitionId: REQ_ID,
          status,
          positionsRequired: 1,
          positionsFilled: 1,
          pipelineCounts: EMPTY_PIPELINE,
        }),
      ).toBeNull();
    }
  });

  it('prompts to open the requisition when DRAFT', () => {
    const result = computeRequisitionNextAction({
      requisitionId: REQ_ID,
      status: 'DRAFT',
      positionsRequired: 2,
      positionsFilled: 0,
      pipelineCounts: EMPTY_PIPELINE,
    });
    expect(result?.sentence).toMatch(/open this requisition/i);
    expect(result?.primary.label).toBe('Open & edit');
  });

  it('prompts to close when all positions are filled', () => {
    const result = computeRequisitionNextAction({
      requisitionId: REQ_ID,
      status: 'OPEN',
      positionsRequired: 2,
      positionsFilled: 2,
      pipelineCounts: EMPTY_PIPELINE,
    });
    expect(result?.sentence).toMatch(/all positions filled/i);
  });

  it('prompts to mark placed when a candidate is at offer', () => {
    const result = computeRequisitionNextAction({
      requisitionId: REQ_ID,
      status: 'OPEN',
      positionsRequired: 2,
      positionsFilled: 0,
      pipelineCounts: { ...EMPTY_PIPELINE, offer: 1 },
    });
    expect(result?.sentence).toMatch(/offer stage/i);
    expect(result?.primary.href).toContain('tab=pipeline');
  });

  it('prompts to advance when candidates are in later stages', () => {
    const result = computeRequisitionNextAction({
      requisitionId: REQ_ID,
      status: 'OPEN',
      positionsRequired: 2,
      positionsFilled: 0,
      pipelineCounts: { ...EMPTY_PIPELINE, interview: 2 },
    });
    expect(result?.sentence).toMatch(/advance candidates/i);
  });

  it('prompts to review sourced candidates when only early-stage activity exists', () => {
    const result = computeRequisitionNextAction({
      requisitionId: REQ_ID,
      status: 'OPEN',
      positionsRequired: 2,
      positionsFilled: 0,
      pipelineCounts: { ...EMPTY_PIPELINE, source: 3 },
    });
    expect(result?.sentence).toMatch(/review the sourced candidates/i);
  });

  it('prompts to add the first candidate when the pipeline is empty', () => {
    const result = computeRequisitionNextAction({
      requisitionId: REQ_ID,
      status: 'OPEN',
      positionsRequired: 2,
      positionsFilled: 0,
      pipelineCounts: EMPTY_PIPELINE,
    });
    expect(result?.sentence).toMatch(/add the first candidate/i);
  });
});
