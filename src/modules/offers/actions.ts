'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import type {
  CreateOfferInput,
  RemoveOfferInput,
  UpdateOfferInput,
  UpdateOfferStatusInput,
} from './schemas';
import { createOffer, removeOffer, updateOffer, updateOfferStatus } from './service';

const revApp = (id: string) => revalidatePath(`/applications/${id}`);

export async function createOfferAction(input: CreateOfferInput) {
  const r = await toActionResult(() => createOffer(input));
  if (r.ok) revApp(input.jobApplicationId);
  return r;
}

export async function updateOfferAction(input: UpdateOfferInput, jobApplicationId: string) {
  const r = await toActionResult(() => updateOffer(input));
  if (r.ok) revApp(jobApplicationId);
  return r;
}

export async function updateOfferStatusAction(
  input: UpdateOfferStatusInput,
  jobApplicationId: string,
) {
  const r = await toActionResult(() => updateOfferStatus(input));
  if (r.ok) revApp(jobApplicationId);
  return r;
}

export async function removeOfferAction(input: RemoveOfferInput, jobApplicationId: string) {
  const r = await toActionResult(() => removeOffer(input));
  if (r.ok) revApp(jobApplicationId);
  return r;
}
