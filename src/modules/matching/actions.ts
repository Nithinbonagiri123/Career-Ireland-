'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import { dismissMatch, removeFromShortlist, runAssistedMatching, shortlistMatch } from './service';

export async function runAssistedMatchingAction(requisitionId: string) {
  const r = await toActionResult(() => runAssistedMatching(requisitionId));
  if (r.ok) revalidatePath(`/requisitions/${requisitionId}`);
  return r;
}

export async function shortlistMatchAction(matchId: string, requisitionId: string) {
  const r = await toActionResult(() => shortlistMatch(matchId));
  if (r.ok) revalidatePath(`/requisitions/${requisitionId}`);
  return r;
}

export async function dismissMatchAction(matchId: string, requisitionId: string) {
  const r = await toActionResult(() => dismissMatch(matchId));
  if (r.ok) revalidatePath(`/requisitions/${requisitionId}`);
  return r;
}

export async function removeFromShortlistAction(
  shortlistEntryId: string,
  requisitionId: string,
  reason?: string,
) {
  const r = await toActionResult(() => removeFromShortlist(shortlistEntryId, reason));
  if (r.ok) {
    revalidatePath(`/requisitions/${requisitionId}`);
    revalidatePath('/shortlists');
  }
  return r;
}
