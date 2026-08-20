'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import type {
  CreatePlacementInput,
  RestoreAvailabilityInput,
  UpdatePlacementStatusInput,
} from './schemas';
import { createPlacement, restoreCandidateAvailability, updatePlacementStatus } from './service';

const rev = () => {
  revalidatePath('/placements');
  revalidatePath('/candidates');
  revalidatePath('/requisitions');
};

export async function createPlacementAction(input: CreatePlacementInput) {
  const r = await toActionResult(() => createPlacement(input));
  if (r.ok) rev();
  return r;
}

export async function updatePlacementStatusAction(input: UpdatePlacementStatusInput) {
  const r = await toActionResult(() => updatePlacementStatus(input));
  if (r.ok) rev();
  return r;
}

export async function restoreCandidateAvailabilityAction(input: RestoreAvailabilityInput) {
  const r = await toActionResult(() => restoreCandidateAvailability(input));
  if (r.ok) rev();
  return r;
}
