'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import type {
  AddRequirementForPersonInput,
  MaterializeRequirementsInput,
  RegisterUploadInput,
  ReviewDocumentInput,
  UpsertRequirementRuleInput,
  VoidDocumentInput,
} from './schemas';
import {
  addPersonSpecificRequirement,
  deleteRequirementRule,
  fetchPersonDocumentsByTypeCode,
  materialiseRequirementsForPerson,
  registerUpload,
  reviewDocument,
  upsertRequirementRule,
  voidDocument,
} from './service';

export async function registerUploadAction(input: RegisterUploadInput) {
  const r = await toActionResult(() => registerUpload(input));
  if (r.ok) {
    revalidatePath('/documents');
    if (input.ownerType === 'PERSON') {
      revalidatePath(`/candidates/${input.ownerId}`);
      revalidatePath('/portal/candidate/documents');
    }
  }
  return r;
}

export async function reviewDocumentAction(input: ReviewDocumentInput) {
  const r = await toActionResult(() => reviewDocument(input));
  if (r.ok) revalidatePath('/documents');
  return r;
}

export async function upsertRequirementRuleAction(input: UpsertRequirementRuleInput) {
  const r = await toActionResult(() => upsertRequirementRule(input));
  if (r.ok) revalidatePath('/admin/document-rules');
  return r;
}

export async function deleteRequirementRuleAction(id: string) {
  const r = await toActionResult(async () => {
    await deleteRequirementRule(id);
    return { ok: true };
  });
  if (r.ok) revalidatePath('/admin/document-rules');
  return r;
}

export async function materialiseRequirementsAction(input: MaterializeRequirementsInput) {
  const r = await toActionResult(() => materialiseRequirementsForPerson(input));
  if (r.ok) revalidatePath(`/candidates/${input.personId}`);
  return r;
}

export async function addPersonSpecificRequirementAction(input: AddRequirementForPersonInput) {
  const r = await toActionResult(() => addPersonSpecificRequirement(input));
  if (r.ok) revalidatePath(`/candidates/${input.personId}`);
  return r;
}

/** Fetch a person's documents filtered by document-type code — used by the CV picker. */
export async function listPersonDocumentsByTypeCodeAction(personId: string, typeCode: string) {
  return toActionResult(() => fetchPersonDocumentsByTypeCode(personId, typeCode));
}

export async function voidDocumentAction(input: VoidDocumentInput) {
  const r = await toActionResult(() => voidDocument(input));
  if (r.ok) {
    revalidatePath('/documents');
    // Fan-out revalidation isn't cheap but there are many places docs surface.
    revalidatePath('/candidates');
    revalidatePath('/portal/candidate/documents');
  }
  return r;
}
