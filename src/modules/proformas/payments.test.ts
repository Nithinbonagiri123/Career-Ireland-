import { describe, expect, it } from 'vitest';
import { RecordProFormaPaymentSchema, VerifyProFormaPaymentSchema } from './schemas';

/**
 * Stage 3 payment-side schema regression. The DB-level arithmetic
 * and partial-payment behaviour is covered by `issuance.test.ts`
 * (which seeds + queries real rows). This file only locks the Zod
 * contracts so a drift in the composer's wire format surfaces
 * independently of the DB.
 */

describe('RecordProFormaPaymentSchema', () => {
  const base = {
    proFormaInvoiceId: '11111111-1111-4111-8111-111111111111',
    amount: '100.00',
    currencyCode: 'EUR',
    method: 'BANK_TRANSFER' as const,
  };

  it('accepts the happy path', () => {
    expect(RecordProFormaPaymentSchema.safeParse(base).success).toBe(true);
  });

  it('accepts cash + other methods', () => {
    expect(RecordProFormaPaymentSchema.safeParse({ ...base, method: 'CASH' }).success).toBe(true);
    expect(RecordProFormaPaymentSchema.safeParse({ ...base, method: 'OTHER' }).success).toBe(true);
  });

  it('rejects a negative amount', () => {
    expect(RecordProFormaPaymentSchema.safeParse({ ...base, amount: '-5.00' }).success).toBe(false);
  });

  it('rejects >2 decimal places', () => {
    expect(RecordProFormaPaymentSchema.safeParse({ ...base, amount: '1.234' }).success).toBe(false);
  });

  it('rejects a 2-letter currency code', () => {
    expect(RecordProFormaPaymentSchema.safeParse({ ...base, currencyCode: 'EU' }).success).toBe(
      false,
    );
  });

  it('rejects an unknown method', () => {
    expect(RecordProFormaPaymentSchema.safeParse({ ...base, method: 'CRYPTO' }).success).toBe(
      false,
    );
  });

  it('accepts a received_at date', () => {
    expect(
      RecordProFormaPaymentSchema.safeParse({ ...base, receivedAt: '2026-10-17' }).success,
    ).toBe(true);
  });

  it('rejects a malformed date', () => {
    expect(
      RecordProFormaPaymentSchema.safeParse({ ...base, receivedAt: 'last tuesday' }).success,
    ).toBe(false);
  });
});

describe('VerifyProFormaPaymentSchema', () => {
  it('requires a valid uuid', () => {
    expect(
      VerifyProFormaPaymentSchema.safeParse({
        paymentId: '11111111-1111-4111-8111-111111111111',
      }).success,
    ).toBe(true);
    expect(VerifyProFormaPaymentSchema.safeParse({ paymentId: 'not-a-uuid' }).success).toBe(false);
  });
});
