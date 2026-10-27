import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/session', () => ({ requireInternalStaff: vi.fn() }));

const { validateLeadConversionCharge } = await import('./service');

/**
 * Decision K1 — the lead-conversion invoice exception is narrow and
 * server-enforced: active service, right payer, catalog currency, catalog
 * (authorized) price for non-finance staff.
 */
const priced = {
  isActive: true,
  payerType: 'PERSON' as const,
  defaultPrice: '250.00',
  defaultCurrencyCode: 'EUR',
};
const base = {
  targetBusiness: 'IMMIGRATION' as const,
  personId: 'p1',
  employerId: null,
  service: priced,
  amount: '250.00',
  currencyCode: 'EUR',
  actorHasFinance: false,
};

describe('validateLeadConversionCharge (K1)', () => {
  it('staff at the catalog price → allowed, priceSource catalog', () => {
    expect(validateLeadConversionCharge(base)).toEqual({ priceSource: 'catalog' });
  });

  it('staff at a different price → refused', () => {
    expect(() => validateLeadConversionCharge({ ...base, amount: '10.00' })).toThrow(
      /catalog price/i,
    );
  });

  it('finance at a different price → allowed, audited as finance_override', () => {
    expect(
      validateLeadConversionCharge({ ...base, amount: '10.00', actorHasFinance: true }),
    ).toEqual({ priceSource: 'finance_override' });
  });

  it('quote-based service (no catalog price) → operator amount, flagged', () => {
    expect(
      validateLeadConversionCharge({
        ...base,
        amount: '1234.00',
        service: { ...priced, defaultPrice: null },
      }),
    ).toEqual({ priceSource: 'operator_entered_no_catalog_price' });
  });

  it('wrong currency → refused, even for finance', () => {
    expect(() =>
      validateLeadConversionCharge({ ...base, currencyCode: 'USD', actorHasFinance: true }),
    ).toThrow(/priced in EUR/);
  });

  it('inactive service → refused', () => {
    expect(() =>
      validateLeadConversionCharge({ ...base, service: { ...priced, isActive: false } }),
    ).toThrow(/no longer offered/);
  });

  it('payer mismatch → refused (employer lead with a person-billed service and vice versa)', () => {
    expect(() =>
      validateLeadConversionCharge({
        ...base,
        targetBusiness: 'RECRUITMENT',
        personId: null,
        employerId: 'e1',
      }),
    ).toThrow(/billed to people/);
    expect(() =>
      validateLeadConversionCharge({ ...base, service: { ...priced, payerType: 'EMPLOYER' } }),
    ).toThrow(/billed to employers/);
  });

  it('missing payer on the lead → refused', () => {
    expect(() => validateLeadConversionCharge({ ...base, personId: null })).toThrow(/no payer/);
  });

  it('ANY-payer services work for both lead kinds', () => {
    const any = { ...priced, payerType: 'ANY' as const };
    expect(validateLeadConversionCharge({ ...base, service: any }).priceSource).toBe('catalog');
    expect(
      validateLeadConversionCharge({
        ...base,
        service: any,
        targetBusiness: 'RECRUITMENT',
        personId: null,
        employerId: 'e1',
      }).priceSource,
    ).toBe('catalog');
  });
});
