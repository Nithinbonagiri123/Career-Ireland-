'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import type {
  ArchiveLeadInput,
  ConvertLeadInput,
  CreateLeadInput,
  UnarchiveLeadInput,
  UpdateLeadStatusInput,
} from './schemas';
import { archiveLead, convertLead, createLead, unarchiveLead, updateLeadStatus } from './service';

const revalidate = () => {
  revalidatePath('/leads');
  revalidatePath('/candidates');
};

export async function createLeadAction(input: CreateLeadInput) {
  const result = await toActionResult(() => createLead(input));
  if (result.ok) revalidate();
  return result;
}

export async function updateLeadStatusAction(input: UpdateLeadStatusInput) {
  const result = await toActionResult(() => updateLeadStatus(input));
  if (result.ok) revalidate();
  return result;
}

export async function convertLeadAction(input: ConvertLeadInput) {
  const result = await toActionResult(() => convertLead(input));
  if (result.ok) revalidate();
  return result;
}

export async function archiveLeadAction(input: ArchiveLeadInput) {
  const result = await toActionResult(() => archiveLead(input));
  if (result.ok) revalidate();
  return result;
}

export async function unarchiveLeadAction(input: UnarchiveLeadInput) {
  const result = await toActionResult(() => unarchiveLead(input));
  if (result.ok) revalidate();
  return result;
}
