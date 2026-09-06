'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/session';
import { toActionResult } from '@/lib/result';
import { markAllRead, markNotificationRead } from './service';

export async function markAllReadAction() {
  const r = await toActionResult(async () => {
    const session = await requireSession();
    return markAllRead(session.user.id);
  });
  if (r.ok) revalidatePath('/notifications');
  return r;
}

const MarkNotificationReadSchema = z.object({ notificationId: z.string().uuid() });
export type MarkNotificationReadInput = z.infer<typeof MarkNotificationReadSchema>;

export async function markNotificationReadAction(input: MarkNotificationReadInput) {
  const r = await toActionResult(async () => {
    const parsed = MarkNotificationReadSchema.parse(input);
    const session = await requireSession();
    return markNotificationRead(session.user.id, parsed.notificationId);
  });
  if (r.ok) revalidatePath('/notifications');
  return r;
}
