'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import type {
  CreateApplicationInput,
  CreateExternalApplicationInput,
  UpdateApplicationStatusInput,
} from './schemas';
import { createApplication, createExternalApplication, updateApplicationStatus } from './service';

export async function createApplicationAction(input: CreateApplicationInput) {
  const r = await toActionResult(() => createApplication(input));
  if (r.ok) revalidatePath(`/requisitions/${input.jobRequisitionId}`);
  return r;
}

export async function createExternalApplicationAction(input: CreateExternalApplicationInput) {
  const r = await toActionResult(() => createExternalApplication(input));
  if (r.ok) {
    revalidatePath('/applications');
    revalidatePath(`/candidates/${input.personId}`);
  }
  return r;
}

export async function updateApplicationStatusAction(
  input: UpdateApplicationStatusInput,
  requisitionId: string | null,
) {
  const r = await toActionResult(() => updateApplicationStatus(input));
  if (r.ok) {
    if (requisitionId) revalidatePath(`/requisitions/${requisitionId}`);
    revalidatePath('/applications');
  }
  return r;
}
