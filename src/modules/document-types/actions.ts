'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import type { SetActiveByIdInput, UpsertDocumentTypeInput } from './schemas';
import { ensureDocumentTypeByCode, setDocumentTypeActive, upsertDocumentType } from './service';

const PAYMENT_PROOF = {
  code: 'PAYMENT_PROOF',
  name: 'Payment proof',
  appliesTo: 'PERSON' as const,
  hasExpiry: false,
};

const CV = {
  code: 'CV',
  name: 'CV / Résumé',
  appliesTo: 'PERSON' as const,
  hasExpiry: false,
};

/** Idempotently ensure the PAYMENT_PROOF document type exists and return its id. */
export async function ensurePaymentProofTypeAction() {
  return toActionResult(async () => {
    const t = await ensureDocumentTypeByCode(PAYMENT_PROOF);
    return { id: t.id, code: t.code, name: t.name };
  });
}

/** Idempotently ensure the CV document type exists and return its id. */
export async function ensureCvTypeAction() {
  return toActionResult(async () => {
    const t = await ensureDocumentTypeByCode(CV);
    return { id: t.id, code: t.code, name: t.name };
  });
}

export async function upsertDocumentTypeAction(input: UpsertDocumentTypeInput) {
  const result = await toActionResult(() => upsertDocumentType(input));
  if (result.ok) revalidatePath('/admin/document-types');
  return result;
}

export async function setDocumentTypeActiveAction(input: SetActiveByIdInput) {
  const result = await toActionResult(() => setDocumentTypeActive(input));
  if (result.ok) revalidatePath('/admin/document-types');
  return result;
}
