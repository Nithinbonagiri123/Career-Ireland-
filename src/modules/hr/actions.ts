'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { toActionResult } from '@/lib/result';
import type { CorrectAttendanceInput, UpsertStaffProfileInput } from './schemas';
import { clockIn, clockOut, correctAttendance, upsertStaffProfile } from './service';

/**
 * Attendance actions. Timestamps come from the server (`NOW()` inside
 * the transaction) — the browser never gets to say what time it is.
 * The caller IP is captured for audit only, not for any decision.
 */
async function readCallerIp(): Promise<string | null> {
  try {
    const h = await headers();
    const xff = h.get('x-forwarded-for');
    if (xff) return xff.split(',')[0]?.trim() ?? null;
    return h.get('x-real-ip');
  } catch {
    return null;
  }
}

export async function clockInAction() {
  const ip = await readCallerIp();
  const r = await toActionResult(() => clockIn(ip));
  if (r.ok) revalidatePath('/hr');
  return r;
}

export async function clockOutAction() {
  const ip = await readCallerIp();
  const r = await toActionResult(() => clockOut(ip));
  if (r.ok) revalidatePath('/hr');
  return r;
}

export async function correctAttendanceAction(input: CorrectAttendanceInput) {
  const r = await toActionResult(() => correctAttendance(input));
  if (r.ok) {
    revalidatePath('/hr');
    revalidatePath('/hr/admin');
  }
  return r;
}

export async function upsertStaffProfileAction(input: UpsertStaffProfileInput) {
  const r = await toActionResult(() => upsertStaffProfile(input));
  if (r.ok) revalidatePath('/hr/admin');
  return r;
}
