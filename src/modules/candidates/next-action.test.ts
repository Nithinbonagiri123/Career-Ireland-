import { describe, expect, it } from 'vitest';
import { computeCandidateNextAction } from './next-action';

const PERSON_ID = '00000000-0000-0000-0000-000000000001';
const NOW = new Date('2026-10-07T12:00:00Z');

function invoice(opts: {
  number: string;
  outstanding: string;
  total?: string;
  issuedDaysAgo: number;
}) {
  return {
    number: opts.number,
    outstandingAmount: opts.outstanding,
    totalAmount: opts.total ?? '150.00',
    issuedAt: new Date(NOW.getTime() - opts.issuedDaysAgo * 24 * 60 * 60 * 1000),
  };
}

describe('computeCandidateNextAction', () => {
  it('returns null when the candidate has nothing pressing', () => {
    const result = computeCandidateNextAction({
      personId: PERSON_ID,
      candidateProfile: { availabilityStatus: 'AVAILABLE', lifecycleStatus: 'ACTIVE' },
      leads: [],
      engagements: [],
      invoices: [],
      now: NOW,
    });
    expect(result).toBeNull();
  });

  it('prompts to issue the first invoice when a lead has no engagement yet', () => {
    const result = computeCandidateNextAction({
      personId: PERSON_ID,
      candidateProfile: null,
      leads: [{ status: 'NEW' }],
      engagements: [],
      invoices: [],
      now: NOW,
    });
    expect(result?.sentence).toMatch(/issue the first invoice/i);
    expect(result?.primary.label).toBe('Create invoice');
    expect(result?.primary.href).toBe(`/candidates/${PERSON_ID}?tab=billing`);
    expect(result?.tone).toBe('default');
  });

  it('prompts to record the payment when an invoice is outstanding but not overdue', () => {
    const result = computeCandidateNextAction({
      personId: PERSON_ID,
      candidateProfile: {
        availabilityStatus: 'TEMPORARILY_UNAVAILABLE',
        lifecycleStatus: 'ACTIVE',
      },
      leads: [],
      engagements: [{ id: 'eng-1', status: 'PENDING_PAYMENT', archivedAt: null }],
      invoices: [invoice({ number: 'INV-0001', outstanding: '150.00', issuedDaysAgo: 3 })],
      now: NOW,
    });
    expect(result?.sentence).toMatch(/record the payment/i);
    expect(result?.dueHint).toBeNull();
    expect(result?.tone).toBe('default');
    expect(result?.primary.href).toBe(`/candidates/${PERSON_ID}/invoices/INV-0001`);
  });

  it('escalates to urgent when the oldest outstanding invoice is >14 days old', () => {
    const result = computeCandidateNextAction({
      personId: PERSON_ID,
      candidateProfile: {
        availabilityStatus: 'TEMPORARILY_UNAVAILABLE',
        lifecycleStatus: 'ACTIVE',
      },
      leads: [],
      engagements: [{ id: 'eng-1', status: 'PENDING_PAYMENT', archivedAt: null }],
      invoices: [invoice({ number: 'INV-0001', outstanding: '150.00', issuedDaysAgo: 30 })],
      now: NOW,
    });
    expect(result?.tone).toBe('urgent');
    expect(result?.dueHint).toBe('overdue');
    expect(result?.sentence).toContain('INV-0001');
    expect(result?.sentence).toContain('30 days');
  });

  it('urgency wins — overdue beats a merely-outstanding invoice', () => {
    const result = computeCandidateNextAction({
      personId: PERSON_ID,
      candidateProfile: null,
      leads: [],
      engagements: [{ id: 'eng-1', status: 'PENDING_PAYMENT', archivedAt: null }],
      invoices: [
        invoice({ number: 'INV-RECENT', outstanding: '150.00', issuedDaysAgo: 2 }),
        invoice({ number: 'INV-OLD', outstanding: '200.00', issuedDaysAgo: 60 }),
      ],
      now: NOW,
    });
    expect(result?.tone).toBe('urgent');
    expect(result?.sentence).toContain('INV-OLD');
  });

  it('prompts to advance a paid-up engagement that has not been marked Active', () => {
    const result = computeCandidateNextAction({
      personId: PERSON_ID,
      candidateProfile: {
        availabilityStatus: 'TEMPORARILY_UNAVAILABLE',
        lifecycleStatus: 'ACTIVE',
      },
      leads: [],
      engagements: [{ id: 'eng-1', status: 'PENDING_PAYMENT', archivedAt: null }],
      invoices: [invoice({ number: 'INV-0001', outstanding: '0.00', issuedDaysAgo: 10 })],
      now: NOW,
    });
    expect(result?.sentence).toMatch(/advance the service/i);
    expect(result?.primary.href).toBe(`/candidates/${PERSON_ID}?tab=billing`);
  });

  it('prompts to update progress on an in-flight engagement', () => {
    const result = computeCandidateNextAction({
      personId: PERSON_ID,
      candidateProfile: {
        availabilityStatus: 'TEMPORARILY_UNAVAILABLE',
        lifecycleStatus: 'ACTIVE',
      },
      leads: [],
      engagements: [{ id: 'eng-1', status: 'ACTIVE', archivedAt: null }],
      invoices: [invoice({ number: 'INV-0001', outstanding: '0.00', issuedDaysAgo: 5 })],
      now: NOW,
    });
    expect(result?.sentence).toMatch(/service is in progress/i);
    expect(result?.tone).toBe('default');
  });

  it('prompts to return the candidate to the pool after a service completes', () => {
    const result = computeCandidateNextAction({
      personId: PERSON_ID,
      candidateProfile: {
        availabilityStatus: 'TEMPORARILY_UNAVAILABLE',
        lifecycleStatus: 'ACTIVE',
      },
      leads: [],
      engagements: [{ id: 'eng-1', status: 'COMPLETED', archivedAt: null }],
      invoices: [invoice({ number: 'INV-0001', outstanding: '0.00', issuedDaysAgo: 20 })],
      now: NOW,
    });
    expect(result?.sentence).toMatch(/return the candidate to the pool/i);
    expect(result?.primary.label).toBe('Edit candidate');
  });

  it('ignores archived engagements when picking the next action', () => {
    const result = computeCandidateNextAction({
      personId: PERSON_ID,
      candidateProfile: { availabilityStatus: 'AVAILABLE', lifecycleStatus: 'ACTIVE' },
      leads: [],
      engagements: [{ id: 'eng-1', status: 'ACTIVE', archivedAt: new Date('2026-01-01') }],
      invoices: [],
      now: NOW,
    });
    expect(result).toBeNull();
  });
});
