'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import type { UpdateStatusInput, UpsertRequisitionInput } from './schemas';
import { updateRequisitionStatus, upsertRequisition } from './service';

export async function upsertRequisitionAction(input: UpsertRequisitionInput) {
  const r = await toActionResult(() => upsertRequisition(input));
  if (r.ok) {
    revalidatePath('/requisitions');
    if (input.id) revalidatePath(`/requisitions/${input.id}`);
  }
  return r;
}

export async function updateRequisitionStatusAction(input: UpdateStatusInput) {
  const r = await toActionResult(() => updateRequisitionStatus(input));
  if (r.ok) {
    revalidatePath('/requisitions');
    revalidatePath(`/requisitions/${input.requisitionId}`);
  }
  return r;
}
