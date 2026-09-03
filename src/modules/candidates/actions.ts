'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import { bulkAssignCandidates, bulkUpdateCandidateLifecycle } from './bulk-service';
import type { BulkAssignCandidatesInput, BulkUpdateLifecycleInput } from './schemas';

function revalidateCandidateList() {
  revalidatePath('/candidates');
}

export async function bulkAssignCandidatesAction(input: BulkAssignCandidatesInput) {
  const r = await toActionResult(() => bulkAssignCandidates(input));
  if (r.ok) {
    revalidateCandidateList();
    for (const id of input.personIds) revalidatePath(`/candidates/${id}`);
  }
  return r;
}

export async function bulkUpdateCandidateLifecycleAction(input: BulkUpdateLifecycleInput) {
  const r = await toActionResult(() => bulkUpdateCandidateLifecycle(input));
  if (r.ok) {
    revalidateCandidateList();
    for (const id of input.personIds) revalidatePath(`/candidates/${id}`);
  }
  return r;
}
