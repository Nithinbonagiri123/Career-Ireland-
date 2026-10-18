import { describe, expect, it } from 'vitest';
import { derivePrimaryOnboardingStatus, type PrimaryStatusInputs } from './onboarding-status';

function baseline(overrides: Partial<PrimaryStatusInputs> = {}): PrimaryStatusInputs {
  return {
    candidateProfile: null,
    leads: [],
    proFormas: [],
    payments: [],
    ...overrides,
  };
}

describe('derivePrimaryOnboardingStatus', () => {
  it('returns ACTIVE_CANDIDATE whenever the person has an active profile — this wins over everything', () => {
    expect(
      derivePrimaryOnboardingStatus(
        baseline({
          candidateProfile: { lifecycleStatus: 'ACTIVE' },
          // Even with a stray pending payment, the active-candidate
          // headline is the operator-relevant truth.
          payments: [{ status: 'PENDING', proFormaInvoiceId: 'pf1' }],
        }),
      ),
    ).toBe('ACTIVE_CANDIDATE');
  });

  it('surfaces payment pending verification ahead of quote-level states', () => {
    expect(
      derivePrimaryOnboardingStatus(
        baseline({
          proFormas: [{ status: 'ACCEPTED' }],
          payments: [{ status: 'PENDING', proFormaInvoiceId: 'pf1' }],
        }),
      ),
    ).toBe('PAYMENT_PENDING_VERIFICATION');
    expect(
      derivePrimaryOnboardingStatus(
        baseline({
          proFormas: [{ status: 'ACCEPTED' }],
          payments: [{ status: 'PROOF_UPLOADED', proFormaInvoiceId: 'pf1' }],
        }),
      ),
    ).toBe('PAYMENT_PENDING_VERIFICATION');
  });

  it('reports PARTIALLY_PAID when an accepted pro forma has verified payments but no active candidate yet', () => {
    expect(
      derivePrimaryOnboardingStatus(
        baseline({
          proFormas: [{ status: 'ACCEPTED' }],
          payments: [{ status: 'VERIFIED', proFormaInvoiceId: 'pf1' }],
          candidateProfile: null,
        }),
      ),
    ).toBe('PARTIALLY_PAID');
  });

  it('reports AWAITING_PAYMENT when the client has accepted but no money has arrived', () => {
    expect(derivePrimaryOnboardingStatus(baseline({ proFormas: [{ status: 'ACCEPTED' }] }))).toBe(
      'AWAITING_PAYMENT',
    );
  });

  it('reports AWAITING_CLIENT_ACCEPTANCE when a pro forma is issued but not yet accepted', () => {
    expect(derivePrimaryOnboardingStatus(baseline({ proFormas: [{ status: 'ISSUED' }] }))).toBe(
      'AWAITING_CLIENT_ACCEPTANCE',
    );
  });

  it('reports PREPARING_QUOTE for a draft pro forma', () => {
    expect(derivePrimaryOnboardingStatus(baseline({ proFormas: [{ status: 'DRAFT' }] }))).toBe(
      'PREPARING_QUOTE',
    );
  });

  it('reports PREPARING_QUOTE for an open CS lead with no quote yet', () => {
    expect(
      derivePrimaryOnboardingStatus(
        baseline({
          leads: [{ status: 'NEW', targetBusiness: 'CANDIDATE_SERVICES' }],
        }),
      ),
    ).toBe('PREPARING_QUOTE');
  });

  it('reports LEAD_CLOSED when the CS lead is lost/rejected/expired/archived and there is no quote in flight', () => {
    expect(
      derivePrimaryOnboardingStatus(
        baseline({
          leads: [{ status: 'LOST', targetBusiness: 'CANDIDATE_SERVICES' }],
        }),
      ),
    ).toBe('LEAD_CLOSED');
  });

  it('returns NEW_ENQUIRY as the fallback', () => {
    expect(derivePrimaryOnboardingStatus(baseline())).toBe('NEW_ENQUIRY');
  });

  it('second paid pro forma on an already-active candidate still reports ACTIVE_CANDIDATE (no backwards slide)', () => {
    expect(
      derivePrimaryOnboardingStatus(
        baseline({
          candidateProfile: { lifecycleStatus: 'ACTIVE' },
          proFormas: [{ status: 'ACCEPTED' }, { status: 'CONVERTED' }],
          payments: [{ status: 'VERIFIED', proFormaInvoiceId: 'pf2' }],
        }),
      ),
    ).toBe('ACTIVE_CANDIDATE');
  });
});
