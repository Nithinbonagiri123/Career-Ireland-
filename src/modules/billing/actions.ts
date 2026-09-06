'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import { voidInvoice } from './service';

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
