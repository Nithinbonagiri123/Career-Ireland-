'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import type { ChangeRoleInput, CreateUserInput, SetActiveInput } from './schemas';
import { changeUserRole, createUser, setUserActive } from './service';

export async function createUserAction(input: CreateUserInput) {
  const result = await toActionResult(() => createUser(input));
  if (result.ok) revalidatePath('/admin/users');
  return result;
}

export async function changeUserRoleAction(input: ChangeRoleInput) {
  const result = await toActionResult(() => changeUserRole(input));
  if (result.ok) revalidatePath('/admin/users');
  return result;
}

export async function setUserActiveAction(input: SetActiveInput) {
  const result = await toActionResult(() => setUserActive(input));
  if (result.ok) revalidatePath('/admin/users');
  return result;
}
