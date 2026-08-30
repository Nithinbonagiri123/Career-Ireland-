'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import type {
  RemoveEmailAccountInput,
  RevealPasswordInput,
  UpsertEmailAccountInput,
} from './schemas';
import { removeEmailAccount, revealPassword, upsertEmailAccount } from './service';

export async function upsertEmailAccountAction(input: UpsertEmailAccountInput) {
  const r = await toActionResult(() => upsertEmailAccount(input));
  if (r.ok) revalidatePath(`/candidates/${input.personId}`);
  return r;
}

/**
 * Returns the plaintext password inside the action result. Callers MUST NOT log
 * `result.data` — treat it as a short-lived UI reveal only.
 */
export async function revealPasswordAction(input: RevealPasswordInput) {
  return toActionResult(() => revealPassword(input));
}

export async function removeEmailAccountAction(input: RemoveEmailAccountInput) {
  const r = await toActionResult(() => removeEmailAccount(input));
  if (r.ok) revalidatePath(`/candidates/${input.personId}`);
  return r;
}
