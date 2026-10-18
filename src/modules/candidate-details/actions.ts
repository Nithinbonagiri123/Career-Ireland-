'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import type {
  AddCandidateQualificationInput,
  AddCandidateSkillInput,
  RemoveCandidateQualificationInput,
  RemoveCandidateSkillInput,
  RemoveEducationEntryInput,
  RemoveEmploymentHistoryInput,
  UpdateCandidateQualificationInput,
  UpdateCandidateSkillInput,
  UpsertEducationEntryInput,
  UpsertEmploymentHistoryInput,
} from './schemas';
import {
  addCandidateQualification,
  addCandidateSkill,
  removeCandidateQualification,
  removeCandidateSkill,
  removeEducationEntry,
  removeEmploymentHistory,
  updateCandidateQualification,
  updateCandidateSkill,
  upsertEducationEntry,
  upsertEmploymentHistory,
} from './service';

function revalidateCandidate(personId: string) {
  // Stage 6F — the old /candidates/[id] route redirects to the Client
  // Workspace; revalidate both so any lingering cached segments drop.
  revalidatePath(`/candidates/${personId}`);
  revalidatePath(`/clients/${personId}`);
}

export async function addCandidateSkillAction(input: AddCandidateSkillInput) {
  const r = await toActionResult(() => addCandidateSkill(input));
  if (r.ok) revalidateCandidate(input.personId);
  return r;
}

export async function updateCandidateSkillAction(
  input: UpdateCandidateSkillInput,
  personId: string,
) {
  const r = await toActionResult(() => updateCandidateSkill(input));
  if (r.ok) revalidateCandidate(personId);
  return r;
}

export async function removeCandidateSkillAction(
  input: RemoveCandidateSkillInput,
  personId: string,
) {
  const r = await toActionResult(() => removeCandidateSkill(input));
  if (r.ok) revalidateCandidate(personId);
  return r;
}

export async function addCandidateQualificationAction(input: AddCandidateQualificationInput) {
  const r = await toActionResult(() => addCandidateQualification(input));
  if (r.ok) revalidateCandidate(input.personId);
  return r;
}

export async function updateCandidateQualificationAction(
  input: UpdateCandidateQualificationInput,
  personId: string,
) {
  const r = await toActionResult(() => updateCandidateQualification(input));
  if (r.ok) revalidateCandidate(personId);
  return r;
}

export async function removeCandidateQualificationAction(
  input: RemoveCandidateQualificationInput,
  personId: string,
) {
  const r = await toActionResult(() => removeCandidateQualification(input));
  if (r.ok) revalidateCandidate(personId);
  return r;
}

export async function upsertEmploymentHistoryAction(input: UpsertEmploymentHistoryInput) {
  const r = await toActionResult(() => upsertEmploymentHistory(input));
  if (r.ok) revalidateCandidate(input.personId);
  return r;
}

export async function removeEmploymentHistoryAction(
  input: RemoveEmploymentHistoryInput,
  personId: string,
) {
  const r = await toActionResult(() => removeEmploymentHistory(input));
  if (r.ok) revalidateCandidate(personId);
  return r;
}

export async function upsertEducationEntryAction(input: UpsertEducationEntryInput) {
  const r = await toActionResult(() => upsertEducationEntry(input));
  if (r.ok) revalidateCandidate(input.personId);
  return r;
}

export async function removeEducationEntryAction(
  input: RemoveEducationEntryInput,
  personId: string,
) {
  const r = await toActionResult(() => removeEducationEntry(input));
  if (r.ok) revalidateCandidate(personId);
  return r;
}
