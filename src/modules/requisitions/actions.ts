'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import type {
  AttachRequisitionQualificationInput,
  AttachRequisitionSkillInput,
  DetachRequisitionQualificationInput,
  DetachRequisitionSkillInput,
  UpdateStatusInput,
  UpsertRequisitionInput,
} from './schemas';
import {
  attachRequisitionQualification,
  attachRequisitionSkill,
  detachRequisitionQualification,
  detachRequisitionSkill,
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
