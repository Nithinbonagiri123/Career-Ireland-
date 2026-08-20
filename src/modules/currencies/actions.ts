'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import type { SetCurrencyActiveInput, UpsertCurrencyInput } from './schemas';
import { setCurrencyActive, upsertCurrency } from './service';

export async function upsertCurrencyAction(input: UpsertCurrencyInput) {
  const result = await toActionResult(() => upsertCurrency(input));
  if (result.ok) revalidatePath('/admin/currencies');
  return result;
}

export async function setCurrencyActiveAction(input: SetCurrencyActiveInput) {
  const result = await toActionResult(() => setCurrencyActive(input));
  if (result.ok) revalidatePath('/admin/currencies');
  return result;
}
