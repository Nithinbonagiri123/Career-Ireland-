'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import type { SetActiveByIdInput, UpsertDocumentTypeInput } from './schemas';
import { setDocumentTypeActive, upsertDocumentType } from './service';

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
