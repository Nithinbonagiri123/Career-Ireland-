'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import type {
  SetActiveByIdInput,
  UpsertServiceItemInput,
  UpsertServicePackageInput,
} from './schemas';
import {
  setServiceItemActive,
  setServicePackageActive,
  upsertServiceItem,
  upsertServicePackage,
} from './service';

const rev = () => revalidatePath('/admin/services');

export async function upsertServiceItemAction(input: UpsertServiceItemInput) {
  const r = await toActionResult(() => upsertServiceItem(input));
  if (r.ok) rev();
  return r;
}
export async function setServiceItemActiveAction(input: SetActiveByIdInput) {
  const r = await toActionResult(() => setServiceItemActive(input));
  if (r.ok) rev();
  return r;
}
export async function upsertServicePackageAction(input: UpsertServicePackageInput) {
  const r = await toActionResult(() => upsertServicePackage(input));
  if (r.ok) rev();
  return r;
}
export async function setServicePackageActiveAction(input: SetActiveByIdInput) {
  const r = await toActionResult(() => setServicePackageActive(input));
  if (r.ok) rev();
  return r;
}
