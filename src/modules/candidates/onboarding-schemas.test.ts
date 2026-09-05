import { describe, expect, it } from 'vitest';
import {
  FinaliseDraftSchema,
  OnboardingPaymentSchema,
  UpdateDraftNarrativeSchema,
  UpdateDraftPersonSchema,
} from './onboarding-schemas';

const UUID = '11111111-1111-4111-8111-111111111111';

describe('UpdateDraftPersonSchema', () => {
  it('accepts a minimal patch (personId only)', () => {
    expect(UpdateDraftPersonSchema.safeParse({ personId: UUID }).success).toBe(true);
  });

  it('accepts a full personal-section patch', () => {
    const r = UpdateDraftPersonSchema.safeParse({
      personId: UUID,
      firstName: 'Priya',
      lastName: 'Patel',
      email: 'priya@example.com',
      phone: '+353 87 111 2222',
      dateOfBirth: '1994-03-15',
      nationality: 'Indian',
      currentCity: 'Cork',
      currentCountry: 'Ireland',
      source: 'REFERRAL',
      notes: 'MSc Data Science, 5 years experience',
    });
    expect(r.success).toBe(true);
  });

  it('rejects an invalid email', () => {
    const r = UpdateDraftPersonSchema.safeParse({ personId: UUID, email: 'not-an-email' });
    expect(r.success).toBe(false);
  });

  it('rejects an invalid source enum', () => {
    const r = UpdateDraftPersonSchema.safeParse({
      personId: UUID,
      source: 'FROM_LINKEDIN' as unknown as 'REFERRAL',
    });
    expect(r.success).toBe(false);
  });

  it('rejects non-UUID personId', () => {
    expect(UpdateDraftPersonSchema.safeParse({ personId: 'nope' }).success).toBe(false);
  });

  it('normalises empty-string optional fields to undefined', () => {
    const r = UpdateDraftPersonSchema.safeParse({ personId: UUID, currentCity: '' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.currentCity).toBeUndefined();
  });

  it('rejects a first name longer than 100 chars', () => {
    expect(
      UpdateDraftPersonSchema.safeParse({
        personId: UUID,
        firstName: 'a'.repeat(101),
      }).success,
    ).toBe(false);
  });
});

describe('UpdateDraftNarrativeSchema', () => {
  it('accepts a valid narrative patch', () => {
    expect(
      UpdateDraftNarrativeSchema.safeParse({
        personId: UUID,
        profileSummary: 'Senior data scientist with 8 years experience',
        coverLetter: 'Dear hiring manager,\n\nI am writing to apply…',
      }).success,
    ).toBe(true);
  });

  it('rejects a cover letter over 10000 chars', () => {
    expect(
      UpdateDraftNarrativeSchema.safeParse({
        personId: UUID,
        coverLetter: 'x'.repeat(10_001),
      }).success,
    ).toBe(false);
  });
});

describe('OnboardingPaymentSchema', () => {
  const good = {
    amount: '750.00',
    currencyCode: 'EUR',
    method: 'BANK_TRANSFER' as const,
    proofReference: 'TXN123',
    receivedAt: '2026-09-04',
    notes: '',
  };

  it('accepts a valid payment payload', () => {
    expect(OnboardingPaymentSchema.safeParse(good).success).toBe(true);
  });

  it.each([
    { amount: 'abc' },
    { amount: '750.123' }, // too many decimals
    { amount: '-750.00' }, // negatives rejected
    { currencyCode: 'EU' }, // must be 3 chars
    { currencyCode: 'EURO' },
    { method: 'STRIPE' as unknown as 'BANK_TRANSFER' },
    { receivedAt: '2026/09/04' },
    { receivedAt: 'yesterday' },
  ])('rejects invalid input: %j', (bad) => {
    expect(OnboardingPaymentSchema.safeParse({ ...good, ...bad }).success).toBe(false);
  });

  it('accepts blank proofReference', () => {
    expect(OnboardingPaymentSchema.safeParse({ ...good, proofReference: '' }).success).toBe(true);
  });
});

describe('FinaliseDraftSchema', () => {
  const good = {
    personId: UUID,
    payment: {
      amount: '500.00',
      currencyCode: 'EUR',
      method: 'CASH' as const,
      receivedAt: '2026-09-04',
    },
  };

  it('accepts a minimal valid finalise payload', () => {
    expect(FinaliseDraftSchema.safeParse(good).success).toBe(true);
  });

  it('accepts an optional cover letter', () => {
    expect(FinaliseDraftSchema.safeParse({ ...good, coverLetter: 'Dear sir,…' }).success).toBe(
      true,
    );
  });

  it('rejects payload without payment section', () => {
    expect(FinaliseDraftSchema.safeParse({ personId: UUID }).success).toBe(false);
  });

  it('rejects payload with malformed payment', () => {
    expect(
      FinaliseDraftSchema.safeParse({
        ...good,
        payment: { ...good.payment, amount: 'not-a-number' },
      }).success,
    ).toBe(false);
  });
});
