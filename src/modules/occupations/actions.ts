'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import type { SetActiveByIdInput, UpsertCategoryInput, UpsertOccupationInput } from './schemas';
import {
  setCategoryActive,
  setOccupationActive,
  upsertCategory,
  upsertOccupation,
} from './service';

const revalidate = () => revalidatePath('/admin/occupations');

export async function upsertCategoryAction(input: UpsertCategoryInput) {
  const result = await toActionResult(() => upsertCategory(input));
  if (result.ok) revalidate();
  return result;
}

export async function setCategoryActiveAction(input: SetActiveByIdInput) {
  const result = await toActionResult(() => setCategoryActive(input));
  if (result.ok) revalidate();
  return result;
}

export async function upsertOccupationAction(input: UpsertOccupationInput) {
  const result = await toActionResult(() => upsertOccupation(input));
  if (result.ok) revalidate();
  return result;
}

export async function setOccupationActiveAction(input: SetActiveByIdInput) {
  const result = await toActionResult(() => setOccupationActive(input));
  if (result.ok) revalidate();
  return result;
}
