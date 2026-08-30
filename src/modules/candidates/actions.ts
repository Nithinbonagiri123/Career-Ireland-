'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import {
  bulkAssignCandidates,
  bulkUpdateCandidateLifecycle,
  type LifecycleStatus,
} from './bulk-service';

function revalidateCandidateList() {
  revalidatePath('/candidates');
}

export async function bulkAssignCandidatesAction(input: {
  personIds: string[];
  userId: string | null;
}) {
  const r = await toActionResult(() => bulkAssignCandidates(input.personIds, input.userId));
  if (r.ok) {
    revalidateCandidateList();
    for (const id of input.personIds) revalidatePath(`/candidates/${id}`);
  }
  return r;
}

export async function bulkUpdateCandidateLifecycleAction(input: {
  personIds: string[];
  lifecycleStatus: LifecycleStatus;
}) {
  const r = await toActionResult(() =>
    bulkUpdateCandidateLifecycle(input.personIds, input.lifecycleStatus),
  );
  if (r.ok) {
    revalidateCandidateList();
    for (const id of input.personIds) revalidatePath(`/candidates/${id}`);
  }
  return r;
}
