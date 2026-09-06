'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import type {
  ArchiveEngagementInput,
  CreateEngagementInput,
  RecordPaymentInput,
  RejectPaymentInput,
  UnarchiveEngagementInput,
  UpdateEngagementStatusInput,
  VerifyPaymentInput,
} from './schemas';
import {
  archiveEngagement,
  createEngagement,
  recordPayment,
  rejectPayment,
  unarchiveEngagement,
  updateEngagementStatus,
  verifyPayment,
} from './service';

const revalidate = () => {
  revalidatePath('/engagements');
  revalidatePath('/payments');
};

export async function createEngagementAction(input: CreateEngagementInput) {
  const r = await toActionResult(() => createEngagement(input));
  if (r.ok) revalidate();
  return r;
}
export async function updateEngagementStatusAction(input: UpdateEngagementStatusInput) {
  const r = await toActionResult(() => updateEngagementStatus(input));
  if (r.ok) revalidate();
  return r;
}
export async function recordPaymentAction(input: RecordPaymentInput) {
  const r = await toActionResult(() => recordPayment(input));
  if (r.ok) revalidate();
  return r;
}
export async function verifyPaymentAction(input: VerifyPaymentInput) {
  const r = await toActionResult(() => verifyPayment(input));
  if (r.ok) revalidate();
  return r;
}
export async function rejectPaymentAction(input: RejectPaymentInput) {
  const r = await toActionResult(() => rejectPayment(input));
  if (r.ok) revalidate();
  return r;
}
export async function archiveEngagementAction(input: ArchiveEngagementInput) {
  const r = await toActionResult(() => archiveEngagement(input));
  if (r.ok) revalidate();
  return r;
}
export async function unarchiveEngagementAction(input: UnarchiveEngagementInput) {
  const r = await toActionResult(() => unarchiveEngagement(input));
  if (r.ok) revalidate();
  return r;
}
