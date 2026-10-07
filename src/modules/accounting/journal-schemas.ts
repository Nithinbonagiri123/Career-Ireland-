import { z } from 'zod';

/**
 * Pure zod schemas for manual-journal posting. Lives in its own module
 * (no auth / db imports) so vitest can import and test the validation
 * logic without pulling the entire server-action stack.
 */

export const PostManualJournalLineSchema = z
  .object({
    accountCode: z.string().min(1).max(10),
    divisionCode: z.string().min(1).max(40).optional(),
    debit: z.string().regex(/^\d+(\.\d{1,2})?$/, 'debit must be a decimal with up to 2 dp'),
    credit: z.string().regex(/^\d+(\.\d{1,2})?$/, 'credit must be a decimal with up to 2 dp'),
    description: z.string().max(500).optional(),
  })
  .refine(
    (l) => (l.debit === '0' || l.debit === '0.00') !== (l.credit === '0' || l.credit === '0.00'),
    { message: 'each line must be either a debit or a credit, not both' },
  );

export const PostManualJournalSchema = z
  .object({
    journalDate: z.date(),
    description: z.string().min(1).max(500),
    transactionCurrency: z
      .string()
      .length(3)
      .regex(/^[A-Z]{3}$/, 'currency code must be 3 uppercase letters'),
    lines: z.array(PostManualJournalLineSchema).min(2, 'a journal needs at least two lines'),
  })
  .refine(
    (j) => {
      const d = j.lines.reduce((s, l) => s + Math.round(parseFloat(l.debit) * 100), 0);
      const c = j.lines.reduce((s, l) => s + Math.round(parseFloat(l.credit) * 100), 0);
      return d === c;
    },
    { message: 'journal is unbalanced — sum(debit) must equal sum(credit)' },
  );

export type PostManualJournalInput = z.infer<typeof PostManualJournalSchema>;
