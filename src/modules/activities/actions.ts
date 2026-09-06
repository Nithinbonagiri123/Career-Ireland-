'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import type {
  ArchiveCommunicationInput,
  ArchiveTaskInput,
  CreateCommunicationInput,
  CreateTaskInput,
  UpdateCommunicationInput,
  UpdateTaskInput,
  UpdateTaskStatusInput,
} from './schemas';
import {
  archiveCommunication,
  archiveTask,
  createCommunication,
  createTask,
  updateCommunication,
  updateTask,
  updateTaskStatus,
} from './service';

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
export async function updateTaskStatusAction(
  input: UpdateTaskStatusInput,
  extraRevalidatePaths?: string[],
) {
  const r = await toActionResult(() => updateTaskStatus(input));
  if (r.ok) {
    rev();
    if (extraRevalidatePaths) {
      for (const p of extraRevalidatePaths) revalidatePath(p);
    }
  }
  return r;
}
export async function updateTaskAction(input: UpdateTaskInput) {
  const r = await toActionResult(() => updateTask(input));
  if (r.ok) rev();
  return r;
}
export async function archiveTaskAction(input: ArchiveTaskInput) {
  const r = await toActionResult(() => archiveTask(input));
  if (r.ok) rev();
  return r;
}
export async function updateCommunicationAction(input: UpdateCommunicationInput) {
  const r = await toActionResult(() => updateCommunication(input));
  if (r.ok) rev();
  return r;
}
export async function archiveCommunicationAction(input: ArchiveCommunicationInput) {
  const r = await toActionResult(() => archiveCommunication(input));
  if (r.ok) rev();
  return r;
}
