'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import {
  createApplicationTypeFromName,
  type SetApplicationTypeActiveInput,
  setApplicationTypeActive,
  type UpsertApplicationTypeInput,
  upsertApplicationType,
} from './application-types';
import type {
  AddCaseDocumentRequirementInput,
  ArchiveCaseInput,
  AttachCaseDocumentInput,
  DetachCaseDocumentInput,
  RemoveCaseDocumentRequirementInput,
  UnarchiveCaseInput,
  UpdateCaseDocumentRequirementInput,
  UpdateCaseStatusInput,
  UpsertCaseInput,
} from './schemas';
import {
  addCaseDocumentRequirement,
  archiveCase,
  attachDocumentToCase,
  detachDocumentFromCase,
  removeCaseDocumentRequirement,
  unarchiveCase,
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

export async function archiveCaseAction(input: ArchiveCaseInput) {
  const r = await toActionResult(() => archiveCase(input));
  if (r.ok) revCase(input.caseId);
  return r;
}

export async function unarchiveCaseAction(input: UnarchiveCaseInput) {
  const r = await toActionResult(() => unarchiveCase(input));
  if (r.ok) revCase(input.caseId);
  return r;
}

// ─── Application Type catalog ────────────────────────────────────────────────

export async function upsertApplicationTypeAction(input: UpsertApplicationTypeInput) {
  const r = await toActionResult(() => upsertApplicationType(input));
  if (r.ok) {
    revalidatePath('/admin/immigration-types');
    rev();
  }
  return r;
}

export async function createApplicationTypeFromNameAction(
  category: 'EMPLOYMENT_PERMIT' | 'VISA' | 'VISA_EXTENSION',
  name: string,
) {
  const r = await toActionResult(() => createApplicationTypeFromName(category, name));
  if (r.ok) {
    revalidatePath('/admin/immigration-types');
    rev();
  }
  return r;
}

export async function setApplicationTypeActiveAction(input: SetApplicationTypeActiveInput) {
  const r = await toActionResult(() => setApplicationTypeActive(input));
  if (r.ok) {
    revalidatePath('/admin/immigration-types');
    rev();
  }
  return r;
}
