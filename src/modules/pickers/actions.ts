'use server';

import { toActionResult } from '@/lib/result';
import { type PickerQuery, searchEmployersForPicker, searchPersonsForPicker } from './service';

export async function searchPersonsForPickerAction(input: PickerQuery) {
  return toActionResult(() => searchPersonsForPicker(input));
}

export async function searchEmployersForPickerAction(input: PickerQuery) {
  return toActionResult(() => searchEmployersForPicker(input));
}
