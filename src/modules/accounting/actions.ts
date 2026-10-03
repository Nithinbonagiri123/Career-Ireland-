'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import { postManualJournal, reverseJournal } from './journals';

/**
 * Thin server-action wrappers around the accounting service layer.
 * `toActionResult` turns thrown AppError/ValidationError/BusinessRuleError
 * into typed `{ ok: false, error }` payloads the client can surface in a
 * toast; everything else bubbles to logger + Sentry.
 */

export async function postManualJournalAction(input: {
  journalDate: string;
  description: string;
  transactionCurrency: string;
  lines: Array<{
    accountCode: string;
    divisionCode?: string;
    debit: string;
    credit: string;
    description?: string;
  }>;
}) {
  const r = await toActionResult(() =>
    postManualJournal({
      ...input,
      journalDate: new Date(input.journalDate),
    }),
  );
  if (r.ok) {
    revalidatePath('/admin/accounting/journals');
    revalidatePath('/admin/accounting');
  }
  return r;
}

export async function reverseJournalAction(input: { journalId: string; reason: string }) {
  const r = await toActionResult(() => reverseJournal(input));
  if (r.ok) {
    revalidatePath('/admin/accounting/journals');
    revalidatePath(`/admin/accounting/journals/${input.journalId}`);
  }
  return r;
}
