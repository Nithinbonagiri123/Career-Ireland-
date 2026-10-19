import { describe, expect, it } from 'vitest';
// Stage 6E+1 — schema moved to its own module so a 'use server' file
// doesn't export non-async values; see direct-payment-schema.ts.
import { DirectPaymentAndConvertSchema } from './direct-payment-schema';

/**
 * Stage 6E Section 3 — schema-level checks for the Direct Payment &
 * Convert input. Full integration behaviour (atomic transaction,
 * idempotency, duplicate detection, lead/invoice/receipt writes) is
 * exercised by the Playwright acceptance tests in
 * e2e/stage6e-*.spec.ts; this file locks the input contract so a
 * downstream caller breaking the shape fails loudly here first.
 */

const base = {
  leadId: '11111111-1111-4111-a111-111111111111',
  serviceCatalogItemId: '22222222-2222-4222-a222-222222222222',
  agreedAmount: '100.00',
  paymentAmount: '100.00',
  currencyCode: 'EUR',
  methodDisplay: 'CASH' as const,
  paymentDate: '2026-10-18',
  idempotencyKey: 'dp-abc-1234567890',
};

describe('DirectPaymentAndConvertSchema', () => {
  it('accepts a minimal valid payload (cash, no reference, no override)', () => {
    const r = DirectPaymentAndConvertSchema.safeParse(base);
    expect(r.success).toBe(true);
  });

  it('rejects a decimal with 3+ places', () => {
    const r = DirectPaymentAndConvertSchema.safeParse({ ...base, paymentAmount: '100.123' });
    expect(r.success).toBe(false);
  });

  it('rejects a bad currency (not 3 chars)', () => {
    const r = DirectPaymentAndConvertSchema.safeParse({ ...base, currencyCode: 'EU' });
    expect(r.success).toBe(false);
  });

  it('rejects a non-ISO-shaped date', () => {
    const r = DirectPaymentAndConvertSchema.safeParse({ ...base, paymentDate: '18/10/2026' });
    expect(r.success).toBe(false);
  });

  it('accepts BANK_TRANSFER, CASH, CARD and OTHER; rejects unknown methods', () => {
    // Stage 6G Screen 10 — CARD is a first-class payments.method value
    // again: the dialog's Card tab stores and prints "CARD" honestly
    // (with only the terminal / processor reference, never card data).
    for (const methodDisplay of ['BANK_TRANSFER', 'CASH', 'CARD', 'OTHER'] as const) {
      expect(DirectPaymentAndConvertSchema.safeParse({ ...base, methodDisplay }).success).toBe(
        true,
      );
    }
    expect(
      DirectPaymentAndConvertSchema.safeParse({
        ...base,
        methodDisplay: 'CHEQUE' as unknown as 'CASH',
      }).success,
    ).toBe(false);
  });

  it('accepts an optional reference', () => {
    const r = DirectPaymentAndConvertSchema.safeParse({
      ...base,
      reference: 'BANK-REF-20261018-001',
    });
    expect(r.success).toBe(true);
  });

  it('accepts an optional override reason', () => {
    const r = DirectPaymentAndConvertSchema.safeParse({
      ...base,
      overrideDuplicateReason: 'Second service in same month, confirmed with client.',
    });
    expect(r.success).toBe(true);
  });

  it('requires an idempotency key of at least 8 chars', () => {
    const r = DirectPaymentAndConvertSchema.safeParse({ ...base, idempotencyKey: 'short' });
    expect(r.success).toBe(false);
  });
});
