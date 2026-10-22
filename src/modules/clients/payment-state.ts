/**
 * Stage C1 — ONE truthful payment-state label, shared by every surface
 * that describes how much of an engagement's agreed amount has been
 * received. The Service history table and the Service billing cards
 * previously derived this independently (the history's quote-less
 * branch was a two-state `settled ? 'Paid' : 'Partially paid'`, so
 * €125 agreed / €0 received printed "Partially paid"). Pure module —
 * no imports — so the matrix is unit-locked.
 *
 * States, per the owner's specification:
 *   received ≤ 0            → 'Awaiting payment'
 *   0 < received < agreed   → 'Partially paid'
 *   received ≥ agreed       → 'Paid'
 *
 * This is the PAYMENT axis only. Service progress (In progress /
 * Completed / …) and the complimentary kind ('No payment due') are
 * separate axes and are decided before this label is consulted.
 */
export type PaymentStateLabel = 'Awaiting payment' | 'Partially paid' | 'Paid';

export function derivePaymentState(
  agreedAmount: string | number,
  receivedAmount: string | number,
): PaymentStateLabel {
  const agreed = typeof agreedAmount === 'number' ? agreedAmount : Number.parseFloat(agreedAmount);
  const received =
    typeof receivedAmount === 'number' ? receivedAmount : Number.parseFloat(receivedAmount);
  const safeAgreed = Number.isFinite(agreed) ? agreed : 0;
  const safeReceived = Number.isFinite(received) ? received : 0;
  if (safeReceived <= 0) return 'Awaiting payment';
  if (safeReceived < safeAgreed) return 'Partially paid';
  return 'Paid';
}
