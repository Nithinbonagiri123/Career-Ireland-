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

// Stage B Wave 3 — Candidate Services progress sub-states. All derived
// from real records: Recruitment's availabilityStatus mirror (PLACED) and
// service_engagements statuses. Precedence inside an ACTIVE lifecycle:
// PLACED > IN_PROGRESS > COMPLETED > ACTIVE_CANDIDATE.
describe('derivePrimaryOnboardingStatus — Wave 3 progress sub-states', () => {
  const active = { lifecycleStatus: 'ACTIVE' as const };

  it('ACTIVE lifecycle with no engagement data stays ACTIVE_CANDIDATE (legacy callers unaffected)', () => {
    expect(derivePrimaryOnboardingStatus(baseline({ candidateProfile: active }))).toBe(
      'ACTIVE_CANDIDATE',
    );
    expect(
      derivePrimaryOnboardingStatus(baseline({ candidateProfile: active, engagements: [] })),
    ).toBe('ACTIVE_CANDIDATE');
  });

  it('a live engagement (ACTIVE / PENDING_PAYMENT / ON_HOLD) reports IN_PROGRESS', () => {
    for (const status of ['ACTIVE', 'PENDING_PAYMENT', 'ON_HOLD'] as const) {
      expect(
        derivePrimaryOnboardingStatus(
          baseline({ candidateProfile: active, engagements: [{ status }] }),
        ),
      ).toBe('IN_PROGRESS');
    }
  });

  it('REQUESTED or CANCELLED engagements alone do not count as in progress', () => {
    expect(
      derivePrimaryOnboardingStatus(
        baseline({
          candidateProfile: active,
          engagements: [{ status: 'REQUESTED' }, { status: 'CANCELLED' }],
        }),
      ),
    ).toBe('ACTIVE_CANDIDATE');
  });

  it('all engagements finished with at least one COMPLETED reports COMPLETED', () => {
    expect(
      derivePrimaryOnboardingStatus(
        baseline({
          candidateProfile: active,
          engagements: [{ status: 'COMPLETED' }, { status: 'CANCELLED' }],
        }),
      ),
    ).toBe('COMPLETED');
  });

  it('a new live engagement after a completed one moves back to IN_PROGRESS (repeat business)', () => {
    expect(
      derivePrimaryOnboardingStatus(
        baseline({
          candidateProfile: active,
          engagements: [{ status: 'COMPLETED' }, { status: 'ACTIVE' }],
        }),
      ),
    ).toBe('IN_PROGRESS');
  });

  it('Recruitment placement (availabilityStatus PLACED) wins over everything, even live engagements', () => {
    expect(
      derivePrimaryOnboardingStatus(
        baseline({
          candidateProfile: { ...active, availabilityStatus: 'PLACED' },
          engagements: [{ status: 'ACTIVE' }],
        }),
      ),
    ).toBe('PLACED');
  });

  it('non-PLACED availability statuses never produce PLACED', () => {
    for (const availabilityStatus of ['AVAILABLE', 'TEMPORARILY_UNAVAILABLE', null] as const) {
      expect(
        derivePrimaryOnboardingStatus(
          baseline({
            candidateProfile: { ...active, availabilityStatus },
            engagements: [{ status: 'COMPLETED' }],
          }),
        ),
      ).toBe('COMPLETED');
    }
  });

  it('sub-states only apply to an ACTIVE lifecycle — an INACTIVE profile with engagements falls through to onboarding states', () => {
    expect(
      derivePrimaryOnboardingStatus(
        baseline({
          candidateProfile: { lifecycleStatus: 'INACTIVE', availabilityStatus: 'PLACED' },
          engagements: [{ status: 'COMPLETED' }],
        }),
      ),
    ).toBe('NEW_ENQUIRY');
  });
});
