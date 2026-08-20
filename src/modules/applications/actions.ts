'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import type { CreateApplicationInput, UpdateApplicationStatusInput } from './schemas';
import { createApplication, updateApplicationStatus } from './service';

export async function createApplicationAction(input: CreateApplicationInput) {
  const r = await toActionResult(() => createApplication(input));
  if (r.ok) revalidatePath(`/requisitions/${input.jobRequisitionId}`);
  return r;
}

export async function updateApplicationStatusAction(
  input: UpdateApplicationStatusInput,
  requisitionId: string,
) {
  const r = await toActionResult(() => updateApplicationStatus(input));
  if (r.ok) revalidatePath(`/requisitions/${requisitionId}`);
  return r;
}
