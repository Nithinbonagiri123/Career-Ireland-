'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import type {
  FinaliseDraftInput,
  UpdateDraftNarrativeInput,
  UpdateDraftPersonInput,
} from './onboarding-schemas';
import {
  createDraft,
  discardDraft,
  finaliseDraft,
  updateDraftNarrative,
  updateDraftPerson,
} from './onboarding-service';

export async function createCandidateDraftAction() {
  return toActionResult(() => createDraft());
}

export async function updateDraftPersonAction(input: UpdateDraftPersonInput) {
  return toActionResult(async () => {
    await updateDraftPerson(input);
    return null;
  });
}

export async function updateDraftNarrativeAction(input: UpdateDraftNarrativeInput) {
  return toActionResult(async () => {
    await updateDraftNarrative(input);
    return null;
  });
}

export async function finaliseDraftAction(input: FinaliseDraftInput) {
  const r = await toActionResult(() => finaliseDraft(input));
  if (r.ok) {
    revalidatePath('/candidates');
    revalidatePath(`/candidates/${r.data.personId}`);
  }
  return r;
}

export async function discardDraftAction(personId: string) {
  const r = await toActionResult(async () => {
    await discardDraft(personId);
    return null;
  });
  if (r.ok) revalidatePath('/candidates');
  return r;
}
