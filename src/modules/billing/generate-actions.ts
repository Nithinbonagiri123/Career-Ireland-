'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import { type GenerateInvoiceInput, generateInvoiceForPayer } from './generate';

export async function generateInvoiceAction(input: GenerateInvoiceInput) {
  const r = await toActionResult(() => generateInvoiceForPayer(input));
  if (r.ok) {
    // Invalidate wherever a fresh invoice would show up. The redirect
    // to the print page happens client-side; this just makes the
    // /engagements + /payments + originating profile page reflect the
    // new engagement on the next visit.
    revalidatePath('/engagements');
    revalidatePath('/payments');
    if (input.payerMode === 'PERSON') {
      revalidatePath(`/candidates/${input.payerId}`);
      revalidatePath('/leads');
    } else {
      revalidatePath(`/employers/${input.payerId}`);
    }
  }
  return r;
}
