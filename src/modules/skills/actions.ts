'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import type { SetActiveByIdInput, UpsertSkillInput } from './schemas';
import { setSkillActive, upsertSkill } from './service';

export async function upsertSkillAction(input: UpsertSkillInput) {
  const result = await toActionResult(() => upsertSkill(input));
  if (result.ok) revalidatePath('/admin/skills');
  return result;
}

export async function setSkillActiveAction(input: SetActiveByIdInput) {
  const result = await toActionResult(() => setSkillActive(input));
  if (result.ok) revalidatePath('/admin/skills');
  return result;
}
