'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import type {
  ArchiveRequisitionInput,
  AttachRequisitionQualificationInput,
  AttachRequisitionSkillInput,
  DetachRequisitionQualificationInput,
  DetachRequisitionSkillInput,
  UnarchiveRequisitionInput,
  UpdateStatusInput,
  UpsertRequisitionInput,
} from './schemas';
import {
  archiveRequisition,
  attachRequisitionQualification,
  attachRequisitionSkill,
  detachRequisitionQualification,
  detachRequisitionSkill,
  unarchiveRequisition,
  updateRequisitionStatus,
  upsertRequisition,
} from './service';

export async function upsertRequisitionAction(input: UpsertRequisitionInput) {
  const r = await toActionResult(() => upsertRequisition(input));
  if (r.ok) {
    revalidatePath('/requisitions');
    if (input.id) revalidatePath(`/requisitions/${input.id}`);
  }
  return r;
}

export async function updateRequisitionStatusAction(input: UpdateStatusInput) {
  const r = await toActionResult(() => updateRequisitionStatus(input));
  if (r.ok) {
    revalidatePath('/requisitions');
    revalidatePath(`/requisitions/${input.requisitionId}`);
  }
  return r;
}

export async function attachRequisitionSkillAction(input: AttachRequisitionSkillInput) {
  const r = await toActionResult(() => attachRequisitionSkill(input));
  if (r.ok) revalidatePath(`/requisitions/${input.jobRequisitionId}`);
  return r;
}

export async function detachRequisitionSkillAction(input: DetachRequisitionSkillInput) {
  const r = await toActionResult(() => detachRequisitionSkill(input));
  if (r.ok) revalidatePath(`/requisitions/${input.jobRequisitionId}`);
  return r;
}

export async function attachRequisitionQualificationAction(
  input: AttachRequisitionQualificationInput,
) {
  const r = await toActionResult(() => attachRequisitionQualification(input));
  if (r.ok) revalidatePath(`/requisitions/${input.jobRequisitionId}`);
  return r;
}

export async function detachRequisitionQualificationAction(
  input: DetachRequisitionQualificationInput,
) {
  const r = await toActionResult(() => detachRequisitionQualification(input));
  if (r.ok) revalidatePath(`/requisitions/${input.jobRequisitionId}`);
  return r;
}

export async function archiveRequisitionAction(input: ArchiveRequisitionInput) {
  const r = await toActionResult(() => archiveRequisition(input));
  if (r.ok) {
    revalidatePath('/requisitions');
    revalidatePath(`/requisitions/${input.requisitionId}`);
  }
  return r;
}

export async function unarchiveRequisitionAction(input: UnarchiveRequisitionInput) {
  const r = await toActionResult(() => unarchiveRequisition(input));
  if (r.ok) {
    revalidatePath('/requisitions');
    revalidatePath(`/requisitions/${input.requisitionId}`);
  }
  return r;
}
