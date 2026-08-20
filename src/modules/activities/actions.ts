'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import type { CreateCommunicationInput, CreateTaskInput, UpdateTaskStatusInput } from './schemas';
import { createCommunication, createTask, updateTaskStatus } from './service';

const rev = () => {
  revalidatePath('/communications');
  revalidatePath('/tasks');
};

export async function createCommunicationAction(input: CreateCommunicationInput) {
  const r = await toActionResult(() => createCommunication(input));
  if (r.ok) rev();
  return r;
}
export async function createTaskAction(input: CreateTaskInput) {
  const r = await toActionResult(() => createTask(input));
  if (r.ok) rev();
  return r;
}
export async function updateTaskStatusAction(input: UpdateTaskStatusInput) {
  const r = await toActionResult(() => updateTaskStatus(input));
  if (r.ok) rev();
  return r;
}
