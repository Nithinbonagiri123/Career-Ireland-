'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth/session';
import { toActionResult } from '@/lib/result';
import { markAllRead } from './service';

export async function markAllReadAction() {
  const r = await toActionResult(async () => {
    const session = await requireSession();
    return markAllRead(session.user.id);
  });
  if (r.ok) revalidatePath('/notifications');
  return r;
}
