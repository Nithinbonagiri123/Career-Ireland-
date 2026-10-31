import { describe, expect, it } from 'vitest';
import { statusTone } from '@/lib/ui/status-tone';
import {
  BILL_STATUSES,
  EVENT_STATUSES,
  FINANCE_STATUS,
  type FinanceStatusKind,
  financeStatus,
  INVOICE_STATUSES,
  JOURNAL_STATUSES,
  PAYMENT_STATUSES,
  PERIOD_STATUSES,
  PRO_FORMA_STATUSES,
} from './finance-status';

const KINDS: Array<[FinanceStatusKind, readonly string[]]> = [
  ['payment', PAYMENT_STATUSES],
  ['invoice', INVOICE_STATUSES],
  ['proForma', PRO_FORMA_STATUSES],
  ['journal', JOURNAL_STATUSES],
  ['period', PERIOD_STATUSES],
  ['bill', BILL_STATUSES],
  ['event', EVENT_STATUSES],
];

describe('finance status maps', () => {
  it.each(KINDS)('%s: every value has a label and tone, nothing extra', (kind, values) => {
    expect(Object.keys(FINANCE_STATUS[kind]).sort()).toEqual([...values].sort());
    for (const v of values) {
      const s = financeStatus(kind, v);
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.label).not.toMatch(/_/);
      expect(s.tone).toBeTruthy();
    }
  });

  it('statuses stay distinguishable by text where tone repeats', () => {
    expect(financeStatus('journal', 'POSTED').label).not.toBe(
      financeStatus('journal', 'REVERSED').label,
    );
    expect(financeStatus('period', 'CLOSED').tone).not.toBe(financeStatus('period', 'LOCKED').tone);
  });

  it('unknown values fall back to a readable label', () => {
    expect(financeStatus('payment', 'SOMETHING_NEW')).toEqual({
      label: 'Something new',
      tone: 'slate',
    });
  });

  it('central status-tone map now knows the accounting statuses', () => {
    for (const s of ['POSTED', 'REVERSED', 'SOFT_CLOSED', 'LOCKED', 'PROCESSED', 'MANUAL_REVIEW']) {
      expect(statusTone(s)).not.toBe('neutral');
    }
  });
});
