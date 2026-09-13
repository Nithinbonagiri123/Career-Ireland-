'use server';

import { revalidatePath } from 'next/cache';
import type { PermissionKey } from '@/lib/auth/permissions';
import { toActionResult } from '@/lib/result';
import {
  applyPermissionChangesAction as apply,
  resetPermissionsToRoleAction as reset,
} from './service';

export async function updateUserPermissionsAction(input: {
  targetUserId: string;
  grants: PermissionKey[];
  revokes: PermissionKey[];
}) {
  const r = await toActionResult(() => apply(input));
  if (r.ok) {
    revalidatePath(`/admin/users/${input.targetUserId}/permissions`);
    revalidatePath('/admin/users');
  }
  return r;
}

export async function resetUserPermissionsAction(targetUserId: string) {
  const r = await toActionResult(() => reset(targetUserId));
  if (r.ok) {
    revalidatePath(`/admin/users/${targetUserId}/permissions`);
    revalidatePath('/admin/users');
  }
  return r;
}
