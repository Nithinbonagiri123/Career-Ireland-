'use server';

import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { WORKSPACES } from '@/components/shell/nav-config';
import { requireSession } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema/users';
import { isBusiness, WORKSPACE_COOKIE } from '@/lib/workspace';

/**
 * Switch the user's active workspace and land them on that workspace's
 * default page. Called from the business-switcher dropdown.
 *
 * Writes both the cookie (fast — read on every render) and the
 * `users.current_workspace` column (persistent — used when a user logs
 * in fresh on a new device). Silently ignores an unknown value so a
 * hand-crafted form post can't crash the app.
 */
export async function switchWorkspaceAction(nextWorkspace: string): Promise<void> {
  const session = await requireSession();
  if (!isBusiness(nextWorkspace)) return;

  const cookieStore = await cookies();
  cookieStore.set(WORKSPACE_COOKIE, nextWorkspace, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    // Not marking secure so it works in dev over http. Session cookie
    // NextAuth already ships with secure=true in prod.
    maxAge: 60 * 60 * 24 * 365,
  });

  await db
    .update(users)
    .set({ currentWorkspace: nextWorkspace })
    .where(eq(users.id, session.user.id));

  const landing = WORKSPACES[nextWorkspace].landingPath;
  redirect(landing);
}
