'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import type {
  AddCandidateQualificationInput,
  AddCandidateSkillInput,
  RemoveCandidateQualificationInput,
  RemoveCandidateSkillInput,
  RemoveEmploymentHistoryInput,
  UpdateCandidateQualificationInput,
  UpdateCandidateSkillInput,
  UpsertEmploymentHistoryInput,
} from './schemas';
import {
  addCandidateQualification,
  addCandidateSkill,
  removeCandidateQualification,
  removeCandidateSkill,
  removeEmploymentHistory,
  updateCandidateQualification,
  updateCandidateSkill,
  upsertEmploymentHistory,
} from './service';

function revalidateCandidate(personId: string) {
  revalidatePath(`/candidates/${personId}`);
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
