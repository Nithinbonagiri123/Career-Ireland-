import { describe, expect, it } from 'vitest';
import { PostManualJournalLineSchema, PostManualJournalSchema } from './journal-schemas';

describe('PostManualJournalLineSchema', () => {
  const valid = { accountCode: '1100', debit: '100.00', credit: '0' };

  it('accepts a pure debit line', () => {
    expect(PostManualJournalLineSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a pure credit line', () => {
    expect(
      PostManualJournalLineSchema.safeParse({ accountCode: '4100', debit: '0', credit: '100.00' })
        .success,
    ).toBe(true);
  });

  it('rejects a line where both debit and credit are non-zero', () => {
    expect(
      PostManualJournalLineSchema.safeParse({
        accountCode: '1100',
        debit: '100.00',
        credit: '100.00',
      }).success,
    ).toBe(false);
  });

  it('rejects a line where both debit and credit are zero', () => {
    expect(
      PostManualJournalLineSchema.safeParse({ accountCode: '1100', debit: '0', credit: '0' })
        .success,
    ).toBe(false);
  });

  it('rejects amounts with more than two decimal places', () => {
    expect(PostManualJournalLineSchema.safeParse({ ...valid, debit: '100.123' }).success).toBe(
      false,
    );
  });

  it('rejects a missing account code', () => {
    expect(PostManualJournalLineSchema.safeParse({ debit: '100.00', credit: '0' }).success).toBe(
      false,
    );
  });
});

describe('PostManualJournalSchema — balance invariant', () => {
  const dr = { accountCode: '1100', debit: '100.00', credit: '0' };
  const cr = { accountCode: '4100', debit: '0', credit: '100.00' };

  it('accepts a balanced two-line journal', () => {
    expect(
      PostManualJournalSchema.safeParse({
        journalDate: new Date('2026-01-01'),
        description: 'Test',
        transactionCurrency: 'EUR',
        lines: [dr, cr],
      }).success,
    ).toBe(true);
  });

  it('rejects an unbalanced journal', () => {
    expect(
      PostManualJournalSchema.safeParse({
        journalDate: new Date('2026-01-01'),
        description: 'Unbalanced',
        transactionCurrency: 'EUR',
        lines: [dr, { accountCode: '4100', debit: '0', credit: '99.00' }],
      }).success,
    ).toBe(false);
  });

  it('rejects a journal with fewer than two lines', () => {
    expect(
      PostManualJournalSchema.safeParse({
        journalDate: new Date('2026-01-01'),
        description: 'Just one',
        transactionCurrency: 'EUR',
        lines: [dr],
      }).success,
    ).toBe(false);
  });

  it('rejects currency that is not 3 uppercase letters', () => {
    expect(
      PostManualJournalSchema.safeParse({
        journalDate: new Date('2026-01-01'),
        description: 'Test',
        transactionCurrency: 'eur',
        lines: [dr, cr],
      }).success,
    ).toBe(false);
  });

  it('accepts balanced journal with three lines', () => {
    expect(
      PostManualJournalSchema.safeParse({
        journalDate: new Date('2026-01-01'),
        description: 'Three lines',
        transactionCurrency: 'EUR',
        lines: [
          { accountCode: '1100', debit: '123.00', credit: '0' },
          { accountCode: '4100', debit: '0', credit: '100.00' },
          { accountCode: '2100', debit: '0', credit: '23.00' },
        ],
      }).success,
    ).toBe(true);
  });

  it('rejects journal with empty description', () => {
    expect(
      PostManualJournalSchema.safeParse({
        journalDate: new Date('2026-01-01'),
        description: '',
        transactionCurrency: 'EUR',
        lines: [dr, cr],
      }).success,
    ).toBe(false);
  });

  it('balance check uses cents (avoids float drift)', () => {
    // 0.1 + 0.2 !== 0.3 in float; but using integer cents 10 + 20 === 30
    expect(
      PostManualJournalSchema.safeParse({
        journalDate: new Date('2026-01-01'),
        description: 'Cents math',
        transactionCurrency: 'EUR',
        lines: [
          { accountCode: '1100', debit: '0.30', credit: '0' },
          { accountCode: '4100', debit: '0', credit: '0.10' },
          { accountCode: '2100', debit: '0', credit: '0.20' },
        ],
      }).success,
    ).toBe(true);
  });
});
