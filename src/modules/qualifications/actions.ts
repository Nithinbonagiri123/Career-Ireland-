'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import type { SetActiveByIdInput, UpsertQualificationInput } from './schemas';
import { setQualificationActive, upsertQualification } from './service';

export async function upsertQualificationAction(input: UpsertQualificationInput) {
  const result = await toActionResult(() => upsertQualification(input));
  if (result.ok) revalidatePath('/admin/qualifications');
  return result;
}

export async function setQualificationActiveAction(input: SetActiveByIdInput) {
  const result = await toActionResult(() => setQualificationActive(input));
  if (result.ok) revalidatePath('/admin/qualifications');
  return result;
}
