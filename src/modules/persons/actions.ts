'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import type {
  ArchivePersonInput,
  CreatePersonInput,
  FindSimilarInput,
  MergePersonsInput,
  UnarchivePersonInput,
} from './schemas';
import {
  archivePerson,
  checkSimilarPersons,
  createPerson,
  mergePersons,
  unarchivePerson,
} from './service';

const revalidateAll = () => {
  revalidatePath('/leads');
  revalidatePath('/candidates');
  revalidatePath('/admin/persons');
};

export async function findSimilarPersonsAction(input: FindSimilarInput) {
  return toActionResult(() => checkSimilarPersons(input));
}

export async function createPersonAction(input: CreatePersonInput) {
  const result = await toActionResult(() => createPerson(input));
  if (result.ok) revalidateAll();
  return result;
}

export async function mergePersonsAction(input: MergePersonsInput) {
  const result = await toActionResult(() => mergePersons(input));
  if (result.ok) revalidateAll();
  return result;
}

export async function archivePersonAction(input: ArchivePersonInput) {
  const result = await toActionResult(() => archivePerson(input));
  if (result.ok) revalidateAll();
  return result;
}

export async function unarchivePersonAction(input: UnarchivePersonInput) {
  const result = await toActionResult(() => unarchivePerson(input));
  if (result.ok) revalidateAll();
  return result;
}
