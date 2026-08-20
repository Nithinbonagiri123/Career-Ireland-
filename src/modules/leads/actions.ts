'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import type { ConvertLeadInput, CreateLeadInput, UpdateLeadStatusInput } from './schemas';
import { convertLead, createLead, updateLeadStatus } from './service';

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
