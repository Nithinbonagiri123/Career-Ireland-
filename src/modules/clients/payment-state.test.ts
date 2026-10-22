import { describe, expect, it } from 'vitest';
import { derivePaymentState } from './payment-state';

// Stage C1 — the three-state matrix per the owner's specification. The
// first case is the reported bug: €125 agreed / €0 received must read
// "Awaiting payment", never "Partially paid".
describe('derivePaymentState', () => {
  it('zero received → Awaiting payment (the reported Ads case)', () => {
    expect(derivePaymentState('125.00', '0.00')).toBe('Awaiting payment');
    expect(derivePaymentState(125, 0)).toBe('Awaiting payment');
  });

  it('partially received → Partially paid', () => {
    expect(derivePaymentState('200.00', '80.00')).toBe('Partially paid');
    expect(derivePaymentState('125.00', '0.01')).toBe('Partially paid');
    expect(derivePaymentState('125.00', '124.99')).toBe('Partially paid');
  });

  it('fully settled (or over) → Paid', () => {
    expect(derivePaymentState('125.00', '125.00')).toBe('Paid');
    expect(derivePaymentState('125.00', '130.00')).toBe('Paid');
  });

  it('degenerate inputs stay truthful, never "Partially paid" at zero', () => {
    expect(derivePaymentState('0.00', '0.00')).toBe('Awaiting payment');
    expect(derivePaymentState('not-a-number', '0')).toBe('Awaiting payment');
    expect(derivePaymentState('100.00', '-5.00')).toBe('Awaiting payment');
  });
});
