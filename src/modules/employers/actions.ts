'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import type {
  ArchiveEmployerInput,
  UnarchiveEmployerInput,
  UpsertContactInput,
  UpsertEmployerInput,
} from './schemas';
import {
  archiveEmployer,
  findSimilarEmployers,
  unarchiveEmployer,
  upsertEmployer,
  upsertEmployerContact,
} from './service';

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

/** Duplicate-detection lookup used by the create-employer dialog. */
export async function findSimilarEmployersAction(input: {
  legalName?: string;
  tradingName?: string;
  website?: string;
}) {
  return toActionResult(() => findSimilarEmployers(input));
}

export async function archiveEmployerAction(input: ArchiveEmployerInput) {
  const r = await toActionResult(() => archiveEmployer(input));
  if (r.ok) {
    revalidatePath('/employers');
    revalidatePath(`/employers/${input.employerId}`);
  }
  return r;
}

export async function unarchiveEmployerAction(input: UnarchiveEmployerInput) {
  const r = await toActionResult(() => unarchiveEmployer(input));
  if (r.ok) {
    revalidatePath('/employers');
    revalidatePath(`/employers/${input.employerId}`);
  }
  return r;
}
