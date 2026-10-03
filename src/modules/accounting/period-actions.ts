'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import { transitionPeriod } from './periods';

/**
 * Server-action wrapper around `transitionPeriod`. Takes the target
 * status as a string so a single endpoint handles close / lock / reopen
 * — the service layer validates the transition.
 */
export async function transitionPeriodAction(input: {
  periodId: string;
  to: 'OPEN' | 'SOFT_CLOSED' | 'CLOSED' | 'LOCKED';
  reason: string;
}) {
  const r = await toActionResult(() => transitionPeriod(input));
  if (r.ok) {
    revalidatePath('/admin/accounting/periods');
    revalidatePath('/admin/accounting');
  }
  return r;
}
