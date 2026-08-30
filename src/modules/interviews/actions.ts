'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import type {
  RemoveInterviewInput,
  RescheduleInterviewInput,
  ScheduleInterviewInput,
  UpdateInterviewInput,
} from './schemas';
import {
  removeInterview,
  rescheduleInterview,
  scheduleInterview,
  updateInterview,
} from './service';

const revApp = (id: string) => revalidatePath(`/applications/${id}`);

export async function scheduleInterviewAction(input: ScheduleInterviewInput) {
  const r = await toActionResult(() => scheduleInterview(input));
  if (r.ok) revApp(input.jobApplicationId);
  return r;
}

export async function updateInterviewAction(input: UpdateInterviewInput, jobApplicationId: string) {
  const r = await toActionResult(() => updateInterview(input));
  if (r.ok) revApp(jobApplicationId);
  return r;
}

export async function rescheduleInterviewAction(
  input: RescheduleInterviewInput,
  jobApplicationId: string,
) {
  const r = await toActionResult(() => rescheduleInterview(input));
  if (r.ok) revApp(jobApplicationId);
  return r;
}

export async function removeInterviewAction(input: RemoveInterviewInput, jobApplicationId: string) {
  const r = await toActionResult(() => removeInterview(input));
  if (r.ok) revApp(jobApplicationId);
  return r;
}
