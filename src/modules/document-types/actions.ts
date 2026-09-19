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

/**
 * Staff-friendly inline creator: give a display name (+ optional expiry flag)
 * and we derive the machine `code` automatically. Used by <DocumentTypePicker>'s
 * "+ New type…" affordance so staff never has to know the code format.
 *
 * Idempotent — if a type with the derived code already exists, we return it
 * rather than error. That way multiple staff members can add "Character
 * reference" in the same minute and end up on the same row.
 */
export async function createDocumentTypeFromNameAction(input: {
  name: string;
  hasExpiry?: boolean;
}) {
  return toActionResult(async () => {
    const name = input.name.trim();
    if (name.length < 2) throw new Error('Name must be at least 2 characters');
    // Derive a machine code: "Character Reference" → "CHARACTER_REFERENCE"
    const code = name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60);
    if (!code) throw new Error('Could not derive a valid code from that name');
    const t = await ensureDocumentTypeByCode({
      code,
      name,
      appliesTo: 'PERSON',
      hasExpiry: input.hasExpiry ?? false,
    });
    revalidatePath('/admin/document-types');
    return { id: t.id, code: t.code, name: t.name, hasExpiry: t.hasExpiry };
  });
}

export async function setDocumentTypeActiveAction(input: SetActiveByIdInput) {
  const result = await toActionResult(() => setDocumentTypeActive(input));
  if (result.ok) revalidatePath('/admin/document-types');
  return result;
}
