'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import type {
  SetActiveByIdInput,
  SetServiceCategoryActiveInput,
  UpsertServiceCategoryInput,
  UpsertServiceItemInput,
  UpsertServicePackageInput,
} from './schemas';
import {
  createServiceItemFromName,
  setServiceCategoryActive,
  setServiceItemActive,
  setServicePackageActive,
  upsertServiceCategory,
  upsertServiceItem,
  upsertServicePackage,
} from './service';

const rev = () => revalidatePath('/admin/services');
// Session 34 — category changes affect both pages because the services
// table displays category labels.
const revCat = () => {
  revalidatePath('/admin/services');
  revalidatePath('/admin/service-categories');
};

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

export async function createServiceItemFromNameAction(input: { name: string }) {
  return toActionResult(() => createServiceItemFromName(input.name));
}

export async function upsertServiceCategoryAction(input: UpsertServiceCategoryInput) {
  const r = await toActionResult(() => upsertServiceCategory(input));
  if (r.ok) revCat();
  return r;
}

export async function setServiceCategoryActiveAction(input: SetServiceCategoryActiveInput) {
  const r = await toActionResult(() => setServiceCategoryActive(input));
  if (r.ok) revCat();
  return r;
}
