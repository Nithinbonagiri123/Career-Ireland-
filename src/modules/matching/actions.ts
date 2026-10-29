'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import type {
  RecordFeedbackInput,
  RecordPresentedInput,
  RemoveFromShortlistInput,
  RunMatchingInput,
} from './schemas';
import {
  dismissMatch,
  manuallyShortlistPerson,
  recordEmployerFeedback,
  recordPresentedToEmployer,
  removeFromShortlist,
  runAssistedMatching,
  shortlistMatch,
} from './service';

// Job pages, the global workspaces and the candidate pages all show matches
// and shortlists, so refresh them together.
function rev(requisitionId?: string) {
  if (requisitionId) revalidatePath(`/requisitions/${requisitionId}`);
  revalidatePath('/matching');
  revalidatePath('/shortlists');
}

export async function runAssistedMatchingAction(input: RunMatchingInput | string) {
  const r = await toActionResult(() => runAssistedMatching(input));
  if (r.ok) rev(typeof input === 'string' ? input : input.requisitionId);
  return r;
}

export async function shortlistMatchAction(matchId: string, requisitionId?: string) {
  const r = await toActionResult(() => shortlistMatch(matchId));
  if (r.ok) rev(requisitionId);
  return r;
}

export async function manuallyShortlistPersonAction(personId: string, requisitionId: string) {
  const r = await toActionResult(() => manuallyShortlistPerson(personId, requisitionId));
  if (r.ok) rev(requisitionId);
  return r;
}

export async function dismissMatchAction(matchId: string, requisitionId?: string) {
  const r = await toActionResult(() => dismissMatch(matchId));
  if (r.ok) rev(requisitionId);
  return r;
}

export async function removeFromShortlistAction(
  input: RemoveFromShortlistInput,
  requisitionId?: string,
) {
  const r = await toActionResult(() => removeFromShortlist(input));
  if (r.ok) rev(requisitionId);
  return r;
}

export async function recordPresentedToEmployerAction(
  input: RecordPresentedInput,
  requisitionId?: string,
) {
  const r = await toActionResult(() => recordPresentedToEmployer(input));
  if (r.ok) rev(requisitionId);
  return r;
}

export async function recordEmployerFeedbackAction(
  input: RecordFeedbackInput,
  requisitionId?: string,
) {
  const r = await toActionResult(() => recordEmployerFeedback(input));
  if (r.ok) rev(requisitionId);
  return r;
}
