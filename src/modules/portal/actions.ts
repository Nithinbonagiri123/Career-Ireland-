'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import type { AcceptInvitationInput, InviteCandidateInput, InviteEmployerInput } from './schemas';
import { acceptInvitation, inviteCandidate, inviteEmployer } from './service';

export async function inviteCandidateAction(input: InviteCandidateInput) {
  const r = await toActionResult(() => inviteCandidate(input));
  if (r.ok) {
    revalidatePath(`/candidates/${input.personId}`);
    revalidatePath('/candidates');
  }
  return r;
}

export async function inviteEmployerAction(input: InviteEmployerInput) {
  const r = await toActionResult(() => inviteEmployer(input));
  if (r.ok) revalidatePath(`/employers/${input.employerId}`);
  return r;
}

export async function acceptInvitationAction(input: AcceptInvitationInput) {
  return toActionResult(() => acceptInvitation(input));
}
