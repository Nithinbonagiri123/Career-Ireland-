'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import type { CreatePersonInput, FindSimilarInput, MergePersonsInput } from './schemas';
import { checkSimilarPersons, createPerson, mergePersons } from './service';

export async function findSimilarPersonsAction(input: FindSimilarInput) {
  return toActionResult(() => checkSimilarPersons(input));
}

export async function createPersonAction(input: CreatePersonInput) {
  const result = await toActionResult(() => createPerson(input));
  if (result.ok) {
    revalidatePath('/leads');
    revalidatePath('/candidates');
  }
  return result;
}

export async function mergePersonsAction(input: MergePersonsInput) {
  const result = await toActionResult(() => mergePersons(input));
  if (result.ok) {
    revalidatePath('/leads');
    revalidatePath('/candidates');
  }
  return result;
}
