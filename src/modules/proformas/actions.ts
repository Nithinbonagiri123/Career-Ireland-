'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import { recordPaymentForProForma, verifyPaymentForProForma } from './payments';
import { issuePreIssuanceRefund } from './refunds';
import {
  CancelProFormaSchema,
  CreateProFormaSchema,
  EditDraftProFormaSchema,
  IssuePreIssuanceRefundSchema,
  IssueProFormaSchema,
  RecordAcceptanceSchema,
  RecordProFormaPaymentSchema,
  RejectProFormaSchema,
  ReviseIssuedProFormaSchema,
  VerifyProFormaPaymentSchema,
} from './schemas';
import {
  cancelProForma,
  createProForma,
  editDraftProForma,
  issueProForma,
  recordAcceptance,
  rejectProForma,
  reviseIssuedProForma,
} from './service';

/**
 * Server actions for the pro-forma composer + lifecycle buttons. Every
 * action zod-parses the raw form payload (so the client can submit
 * untyped FormData, the server pins the contract), calls the service
 * inside its own transaction, and revalidates the lead detail +
 * leads list on success.
 */

function revalidateLead(leadId: string, proFormaId?: string) {
  revalidatePath(`/leads/${leadId}`);
  revalidatePath('/leads');
  if (proFormaId) revalidatePath(`/leads/${leadId}/pro-formas/${proFormaId}`);
}

export async function createProFormaAction(input: unknown) {
  const parsed = CreateProFormaSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
    };
  }
  const r = await toActionResult(() => createProForma(parsed.data));
  if (r.ok) revalidateLead(parsed.data.sourceLeadId, r.data.id);
  return r;
}

export async function editDraftProFormaAction(input: unknown) {
  const parsed = EditDraftProFormaSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
    };
  }
  const r = await toActionResult(() => editDraftProForma(parsed.data));
  if (r.ok) revalidateLead(r.data.sourceLeadId, r.data.id);
  return r;
}

export async function issueProFormaAction(input: unknown) {
  const parsed = IssueProFormaSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
    };
  }
  const r = await toActionResult(() => issueProForma(parsed.data));
  if (r.ok) revalidateLead(r.data.sourceLeadId, r.data.id);
  return r;
}

export async function reviseIssuedProFormaAction(input: unknown) {
  const parsed = ReviseIssuedProFormaSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
    };
  }
  const r = await toActionResult(() => reviseIssuedProForma(parsed.data));
  if (r.ok) revalidateLead(r.data.sourceLeadId, r.data.id);
  return r;
}

export async function recordAcceptanceAction(input: unknown) {
  const parsed = RecordAcceptanceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
    };
  }
  const r = await toActionResult(() => recordAcceptance(parsed.data));
  if (r.ok) revalidateLead(r.data.sourceLeadId, r.data.id);
  return r;
}

export async function rejectProFormaAction(input: unknown) {
  const parsed = RejectProFormaSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
    };
  }
  const r = await toActionResult(() => rejectProForma(parsed.data));
  if (r.ok) revalidateLead(r.data.sourceLeadId, r.data.id);
  return r;
}

export async function cancelProFormaAction(input: unknown) {
  const parsed = CancelProFormaSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
    };
  }
  const r = await toActionResult(() => cancelProForma(parsed.data));
  if (r.ok) revalidateLead(r.data.sourceLeadId, r.data.id);
  return r;
}

export async function recordProFormaPaymentAction(input: unknown) {
  const parsed = RecordProFormaPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
    };
  }
  const r = await toActionResult(() =>
    recordPaymentForProForma({
      proFormaInvoiceId: parsed.data.proFormaInvoiceId,
      amount: parsed.data.amount,
      currencyCode: parsed.data.currencyCode,
      method: parsed.data.method,
      receivedAt: parsed.data.receivedAt ? new Date(parsed.data.receivedAt) : null,
      proofReference: parsed.data.proofReference || null,
    }),
  );
  if (r.ok) {
    revalidatePath(`/leads/${parsed.data.proFormaInvoiceId}`);
    revalidatePath('/leads');
  }
  return r;
}

export async function verifyProFormaPaymentAction(input: unknown) {
  const parsed = VerifyProFormaPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
    };
  }
  const r = await toActionResult(() => verifyPaymentForProForma(parsed.data.paymentId));
  if (r.ok) {
    revalidatePath('/leads');
    revalidatePath('/payments');
    revalidatePath('/candidates');
    // Stage 6F — when verification activates the candidate, revalidate
    // the workspace so the operator who just verified sees the
    // candidate-active state (CONVERTED lead, Active profile) without
    // having to reload the page manually.
    if (r.data.candidatePersonId) {
      revalidatePath(`/clients/${r.data.candidatePersonId}`);
    }
  }
  return r;
}

/**
 * Pre-issuance refund — Finance / Admin only. Called from the UI when a
 * client cancels mid-partial-payment and no official invoice exists yet.
 * Idempotency key MUST be supplied; the server dedups retries.
 */
export async function issuePreIssuanceRefundAction(input: unknown) {
  const parsed = IssuePreIssuanceRefundSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
    };
  }
  const r = await toActionResult(() =>
    issuePreIssuanceRefund({
      paymentId: parsed.data.paymentId,
      amount: parsed.data.amount,
      method: parsed.data.method,
      reason: parsed.data.reason,
      reference: parsed.data.reference || null,
      idempotencyKey: parsed.data.idempotencyKey,
    }),
  );
  if (r.ok) {
    revalidatePath('/leads');
    revalidatePath('/payments');
  }
  return r;
}
