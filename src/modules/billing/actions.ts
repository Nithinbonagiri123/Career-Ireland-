'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import { grantComplimentaryService } from './complimentary';
import type { GrantComplimentaryServiceInput } from './complimentary-schemas';
import { issueCreditNote, issueRefund, voidInvoice } from './service';

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

export async function issueRefundAction(input: {
  paymentId: string;
  invoiceNumber: string;
  profileHref: string;
  amount: string;
  method: 'BANK_TRANSFER' | 'CASH' | 'OTHER';
  reason: string;
  reference?: string;
}) {
  const r = await toActionResult(() =>
    issueRefund({
      paymentId: input.paymentId,
      amount: input.amount,
      method: input.method,
      reason: input.reason,
      reference: input.reference,
    }),
  );
  if (r.ok) {
    revalidatePath(input.profileHref);
    revalidatePath(`${input.profileHref}/invoices/${input.invoiceNumber}`);
    revalidatePath('/payments');
  }
  return r;
}

/** Stage B Wave 4 — grant a complimentary (€0.00) service from the client
 *  workspace. Permission + validation live in the service. */
export async function grantComplimentaryServiceAction(input: GrantComplimentaryServiceInput) {
  const r = await toActionResult(() => grantComplimentaryService(input));
  if (r.ok) {
    revalidatePath('/candidates');
    revalidatePath('/payments');
  }
  return r;
}
