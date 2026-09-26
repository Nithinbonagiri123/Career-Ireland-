'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import {
  type BusinessCaseTypeModule,
  createBusinessCaseTypeFromName,
  type SetBusinessCaseTypeActiveInput,
  setBusinessCaseTypeActive,
  type UpsertBusinessCaseTypeInput,
  upsertBusinessCaseType,
} from './business-case-types';

// Every future admin page for a business_case_types module gets its own
// revalidate slug here. Keep in sync with the actual admin route.
const ADMIN_PATH: Record<BusinessCaseTypeModule, string> = {
  ADVERTISEMENT_CHANNEL: '/admin/advertisement-channels',
};

export async function upsertBusinessCaseTypeAction(input: UpsertBusinessCaseTypeInput) {
  const r = await toActionResult(() => upsertBusinessCaseType(input));
  if (r.ok) revalidatePath(ADMIN_PATH[input.module]);
  return r;
}

export async function createBusinessCaseTypeFromNameAction(
  module: BusinessCaseTypeModule,
  name: string,
) {
  const r = await toActionResult(() => createBusinessCaseTypeFromName(module, name));
  if (r.ok) revalidatePath(ADMIN_PATH[module]);
  return r;
}

export async function setBusinessCaseTypeActiveAction(input: SetBusinessCaseTypeActiveInput) {
  const r = await toActionResult(() => setBusinessCaseTypeActive(input));
  if (r.ok && r.data.module in ADMIN_PATH) {
    revalidatePath(ADMIN_PATH[r.data.module as BusinessCaseTypeModule]);
  }
  return r;
}
