import { describe, expect, it } from 'vitest';
import { IssuePreIssuanceRefundSchema } from './schemas';

/**
 * Stage 4.1 — pre-issuance refund schema tests. The service-level
 * behaviour (idempotency, overrefund guard, concurrent FOR UPDATE)
 * requires an authenticated session so it's exercised end-to-end by
 * `scripts/stage4.1-refund-walkthrough.ts`.
 */

const UID = '11111111-1111-4111-8111-111111111111';
const BASE = {
  paymentId: UID,
  amount: '50.00',
  method: 'BANK_TRANSFER' as const,
  reason: 'client cancelled mid-payment',
  idempotencyKey: 'uniq-key-1',
};

describe('IssuePreIssuanceRefundSchema', () => {
  it('accepts the happy path', () => {
    expect(IssuePreIssuanceRefundSchema.safeParse(BASE).success).toBe(true);
  });

  it('rejects reason shorter than 3 characters', () => {
    expect(IssuePreIssuanceRefundSchema.safeParse({ ...BASE, reason: 'ok' }).success).toBe(false);
  });

  it('rejects a 3-decimal amount', () => {
    expect(IssuePreIssuanceRefundSchema.safeParse({ ...BASE, amount: '1.234' }).success).toBe(
      false,
    );
  });

  it('rejects a negative amount', () => {
    expect(IssuePreIssuanceRefundSchema.safeParse({ ...BASE, amount: '-5.00' }).success).toBe(
      false,
    );
  });

  it('requires idempotencyKey', () => {
    expect(IssuePreIssuanceRefundSchema.safeParse({ ...BASE, idempotencyKey: '' }).success).toBe(
      false,
    );
  });

  it('rejects an unknown method', () => {
    const bad = { ...BASE, method: 'CRYPTO' as unknown as 'BANK_TRANSFER' };
    expect(IssuePreIssuanceRefundSchema.safeParse(bad).success).toBe(false);
  });
});
