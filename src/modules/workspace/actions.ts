'use server';

import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { WORKSPACES } from '@/components/shell/nav-config';
import { requireSession } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema/users';
import { isBusiness, WORKSPACE_COOKIE } from '@/lib/workspace';

async function writeWorkspaceChoice(nextWorkspace: string): Promise<void> {
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
}

/**
 * Switch workspace + redirect. Still exported for any flow that needs
 * a server-driven navigation (e.g. non-JS fallback). The dropdown no
 * longer uses this — see `persistWorkspaceChoiceAction` below.
 */
export async function switchWorkspaceAction(nextWorkspace: string): Promise<void> {
  if (!isBusiness(nextWorkspace)) return;
  await writeWorkspaceChoice(nextWorkspace);
  redirect(WORKSPACES[nextWorkspace].landingPath);
}

/**
 * Fire-and-forget variant used by the dropdown. The client navigates
 * optimistically via a <Link> (so the destination is prefetched); this
 * writes the cookie + DB in the background so a future render — or a
 * cold login on another device — resolves to the same workspace. No
 * redirect; the client already has the user on the right page.
 */
export async function persistWorkspaceChoiceAction(nextWorkspace: string): Promise<void> {
  await writeWorkspaceChoice(nextWorkspace);
}
