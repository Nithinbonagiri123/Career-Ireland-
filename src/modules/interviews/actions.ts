'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import {
  cancelInterview,
  recordInterviewResult,
  scheduleInterview,
  updateInterview,
  updateInterviewFeedback,
} from './manage';
import type {
  CancelInterviewInput,
  RecordInterviewResultInput,
  ScheduleInterviewInput,
  UpdateInterviewFeedbackInput,
  UpdateInterviewInput,
} from './schemas';

function rev() {
  revalidatePath('/requisitions/[id]', 'page');
  revalidatePath('/interviews');
}

export async function scheduleInterviewAction(input: ScheduleInterviewInput) {
  const r = await toActionResult(() => scheduleInterview(input));
  if (r.ok) rev();
  return r;
}

export async function updateInterviewAction(input: UpdateInterviewInput) {
  const r = await toActionResult(() => updateInterview(input));
  if (r.ok) rev();
  return r;
}

export async function cancelInterviewAction(input: CancelInterviewInput) {
  const r = await toActionResult(() => cancelInterview(input));
  if (r.ok) rev();
  return r;
}

export async function recordInterviewResultAction(input: RecordInterviewResultInput) {
  const r = await toActionResult(() => recordInterviewResult(input));
  if (r.ok) rev();
  return r;
}

export async function updateInterviewFeedbackAction(input: UpdateInterviewFeedbackInput) {
  const r = await toActionResult(() => updateInterviewFeedback(input));
  if (r.ok) rev();
  return r;
}
