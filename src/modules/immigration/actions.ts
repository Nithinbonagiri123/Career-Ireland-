'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import type {
  AddCaseDocumentRequirementInput,
  AttachCaseDocumentInput,
  DetachCaseDocumentInput,
  RemoveCaseDocumentRequirementInput,
  UpdateCaseDocumentRequirementInput,
  UpdateCaseStatusInput,
  UpsertCaseInput,
} from './schemas';
import {
  addCaseDocumentRequirement,
  attachDocumentToCase,
  detachDocumentFromCase,
  removeCaseDocumentRequirement,
  updateCaseDocumentRequirement,
  updateCaseStatus,
  upsertCase,
} from './service';

const rev = () => revalidatePath('/immigration');
const revCase = (id: string) => {
  rev();
  revalidatePath(`/immigration/${id}`);
};

export async function upsertCaseAction(input: UpsertCaseInput) {
  const r = await toActionResult(() => upsertCase(input));
  if (r.ok) rev();
  return r;
}

export async function updateCaseStatusAction(input: UpdateCaseStatusInput) {
  const r = await toActionResult(() => updateCaseStatus(input));
  if (r.ok) revCase(input.caseId);
  return r;
}

export async function addCaseDocumentRequirementAction(input: AddCaseDocumentRequirementInput) {
  const r = await toActionResult(() => addCaseDocumentRequirement(input));
  if (r.ok) revCase(input.immigrationCaseId);
  return r;
}

export async function updateCaseDocumentRequirementAction(
  input: UpdateCaseDocumentRequirementInput,
  caseId: string,
) {
  const r = await toActionResult(() => updateCaseDocumentRequirement(input));
  if (r.ok) revCase(caseId);
  return r;
}

export async function removeCaseDocumentRequirementAction(
  input: RemoveCaseDocumentRequirementInput,
  caseId: string,
) {
  const r = await toActionResult(() => removeCaseDocumentRequirement(input));
  if (r.ok) revCase(caseId);
  return r;
}

export async function attachCaseDocumentAction(input: AttachCaseDocumentInput) {
  const r = await toActionResult(() => attachDocumentToCase(input));
  if (r.ok) revCase(input.immigrationCaseId);
  return r;
}

export async function detachCaseDocumentAction(input: DetachCaseDocumentInput) {
  const r = await toActionResult(() => detachDocumentFromCase(input));
  if (r.ok) revCase(input.immigrationCaseId);
  return r;
}
