'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import { issueCreditNote, voidInvoice } from './service';

export async function voidInvoiceAction(input: {
  invoiceId: string;
  invoiceNumber: string;
  personId: string;
  reason: string;
}) {
  const r = await toActionResult(() => voidInvoice(input.invoiceId, input.reason));
  if (r.ok) {
    revalidatePath(`/candidates/${input.personId}`);
    revalidatePath(`/candidates/${input.personId}/invoices/${input.invoiceNumber}`);
  }
  return r;
}

export async function issueCreditNoteAction(input: {
  invoiceId: string;
  invoiceNumber: string;
  /** Whichever profile the invoice sits under — we revalidate its
   *  billing surface so paid/outstanding numbers refresh. */
  profileHref: string;
  amount: string;
  reason: string;
}) {
  const r = await toActionResult(() =>
    issueCreditNote({
      invoiceId: input.invoiceId,
      amount: input.amount,
      reason: input.reason,
    }),
  );
  if (r.ok) {
    revalidatePath(input.profileHref);
    revalidatePath(`${input.profileHref}/invoices/${input.invoiceNumber}`);
  }
  return r;
}
