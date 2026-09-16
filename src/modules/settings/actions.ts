'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import { type UpdateAppSettingsInput, updateAppSettings } from './service';

export async function updateAppSettingsAction(input: UpdateAppSettingsInput) {
  const r = await toActionResult(() => updateAppSettings(input));
  if (r.ok) {
    // Any change here affects every printable in the app — revalidate
    // the admin page + the two known print routes so cached HTML picks
    // up the new letterhead on the next hit.
    revalidatePath('/admin/settings');
    revalidatePath('/admin');
  }
  return r;
}
