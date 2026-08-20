'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import type { UpdateCaseStatusInput, UpsertCaseInput } from './schemas';
import { updateCaseStatus, upsertCase } from './service';

const rev = () => revalidatePath('/immigration');

export async function upsertCaseAction(input: UpsertCaseInput) {
  const r = await toActionResult(() => upsertCase(input));
  if (r.ok) rev();
  return r;
}

export async function updateCaseStatusAction(input: UpdateCaseStatusInput) {
  const r = await toActionResult(() => updateCaseStatus(input));
  if (r.ok) rev();
  return r;
}
