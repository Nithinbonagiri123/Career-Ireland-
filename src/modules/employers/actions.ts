'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import type { UpsertContactInput, UpsertEmployerInput } from './schemas';
import { upsertEmployer, upsertEmployerContact } from './service';

export async function upsertEmployerAction(input: UpsertEmployerInput) {
  const r = await toActionResult(() => upsertEmployer(input));
  if (r.ok) {
    revalidatePath('/employers');
    if (input.id) revalidatePath(`/employers/${input.id}`);
  }
  return r;
}

export async function upsertEmployerContactAction(input: UpsertContactInput) {
  const r = await toActionResult(() => upsertEmployerContact(input));
  if (r.ok) revalidatePath(`/employers/${input.employerId}`);
  return r;
}
