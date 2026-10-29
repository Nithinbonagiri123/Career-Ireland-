'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import type { CreateOfferInput, TransitionOfferInput, UpdateOfferInput } from './schemas';
import { createOffer, transitionOffer, updateOffer } from './service';

function rev() {
  revalidatePath('/requisitions/[id]', 'page');
  revalidatePath('/interviews');
}

export async function createOfferAction(input: CreateOfferInput) {
  const r = await toActionResult(() => createOffer(input));
  if (r.ok) rev();
  return r;
}

export async function updateOfferAction(input: UpdateOfferInput) {
  const r = await toActionResult(() => updateOffer(input));
  if (r.ok) rev();
  return r;
}

export async function transitionOfferAction(input: TransitionOfferInput) {
  const r = await toActionResult(() => transitionOffer(input));
  if (r.ok) rev();
  return r;
}
