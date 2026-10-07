'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import { postYearEndClose } from './year-end-close';

export async function postYearEndCloseAction(input: { year: number }) {
  const r = await toActionResult(() => postYearEndClose(input));
  if (r.ok) {
    revalidatePath('/admin/accounting/journals');
    revalidatePath('/admin/accounting/balance-sheet');
    revalidatePath('/admin/accounting');
  }
  return r;
}
