import { describe, expect, it } from 'vitest';
import { resolveDivisionForInvoice } from './rule-engine';

describe('resolveDivisionForInvoice — precedence', () => {
  it('immigration_case_id wins over everything', () => {
    expect(
      resolveDivisionForInvoice({
        immigrationCaseId: 'ic1',
        placementId: 'p1',
        jobRequisitionId: 'j1',
        sourceLeadTargetBusiness: 'RECRUITMENT',
      }),
    ).toBe('immigration');
  });

  it('placement_id implies recruitment', () => {
    expect(
      resolveDivisionForInvoice({
        placementId: 'p1',
      }),
    ).toBe('recruitment');
  });

  it('job_requisition_id implies recruitment', () => {
    expect(
      resolveDivisionForInvoice({
        jobRequisitionId: 'j1',
      }),
    ).toBe('recruitment');
  });

  it('placement wins over the source-lead business when both are set', () => {
    // A placement implies recruitment regardless of what the lead
    // originally said — the operational truth is in the back-link, not
    // the historical lead categorisation.
    expect(
      resolveDivisionForInvoice({
        placementId: 'p1',
        sourceLeadTargetBusiness: 'IMMIGRATION',
      }),
    ).toBe('recruitment');
  });

  it('falls back to source-lead business when no back-links', () => {
    expect(resolveDivisionForInvoice({ sourceLeadTargetBusiness: 'IMMIGRATION' })).toBe(
      'immigration',
    );
    expect(resolveDivisionForInvoice({ sourceLeadTargetBusiness: 'CANDIDATE_SERVICES' })).toBe(
      'candidate_services',
    );
    expect(resolveDivisionForInvoice({ sourceLeadTargetBusiness: 'RECRUITMENT' })).toBe(
      'recruitment',
    );
  });

  it('ignores an unrecognised source-lead business and defaults to candidate_services', () => {
    expect(resolveDivisionForInvoice({ sourceLeadTargetBusiness: 'MARKETING' })).toBe(
      'candidate_services',
    );
  });

  it('defaults to candidate_services when nothing is set', () => {
    expect(resolveDivisionForInvoice({})).toBe('candidate_services');
  });

  it('treats null back-links as absent', () => {
    expect(
      resolveDivisionForInvoice({
        immigrationCaseId: null,
        placementId: null,
        jobRequisitionId: null,
        sourceLeadTargetBusiness: null,
      }),
    ).toBe('candidate_services');
  });
});
