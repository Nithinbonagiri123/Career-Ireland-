'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import type { UpsertWorkPermitChecklistInput } from './schemas';
import { deleteChecklist, upsertChecklist } from './service';

export async function upsertChecklistAction(input: UpsertWorkPermitChecklistInput) {
  const r = await toActionResult(() => upsertChecklist(input));
  if (r.ok) {
    revalidatePath(`/requisitions/${input.jobRequisitionId}`);
    revalidatePath(`/requisitions/${input.jobRequisitionId}/checklists/${input.personId}`);
  }
  return r;
}

export async function deleteChecklistAction(input: { id: string; jobRequisitionId: string }) {
  const r = await toActionResult(async () => {
    await deleteChecklist(input.id);
    return { ok: true };
  });
  if (r.ok) {
    revalidatePath(`/requisitions/${input.jobRequisitionId}`);
  }
  return r;
}
