import { AppSidebar } from '@/components/shell/app-sidebar';
import { WORKSPACES } from '@/components/shell/nav-config';
import { ScrollShell } from '@/components/shell/scroll-shell';
import { TopBar } from '@/components/shell/top-bar';
import { BUSINESSES, MODULES, VERBS } from '@/lib/auth/permissions';
import { requireSession } from '@/lib/auth/session';
import { resolveCurrentWorkspace } from '@/lib/workspace';
import { countMyUnread } from '@/modules/notifications/service';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const [unreadCount, workspaceState] = await Promise.all([
    countMyUnread(session.user.id).catch(() => 0),
    resolveCurrentWorkspace(),
  ]);

  // Fallback: if permission resolution fails (should be impossible for an
  // authenticated user, but belt & braces), fall back to Main + all
  // modules visible. The service layer still gates mutations.
  const workspace = workspaceState?.current ?? 'main';
  const reachable = workspaceState?.reachable ?? [...BUSINESSES];
  const isOwner = workspaceState?.isOwner ?? false;

  // Compute which modules are visible for this user. Owner + no perms
  // → everything visible. Otherwise, use the granted set.
  const visibleModules = new Set<string>();
  if (isOwner) {
    for (const business of BUSINESSES) {
      for (const module of MODULES[business] as readonly string[]) {
        visibleModules.add(`${business}.${module}`);
      }
    }
  } else {
    // Non-owner: mirror the sidebar's key format from the module list
    // and check each one against the user's grants via a per-request
    // permission fetch. Cheap because we're already in the layout.
    const { loadCurrentUserPermissions } = await import('@/lib/auth/session');
    const { hasPermission } = await import('@/lib/auth/permissions');
    const snap = await loadCurrentUserPermissions();
    if (snap) {
      for (const business of BUSINESSES) {
        for (const w of Object.values(WORKSPACES)) {
          if (w.key !== business) continue;
          for (const section of w.sections) {
            for (const item of section.items) {
              if (hasPermission(snap.granted, business, item.module, 'view')) {
                visibleModules.add(`${business}.${item.module}`);
              }
            }
          }
        }
      }
    }
  }
  // Keep an escape hatch — reference VERBS so this import isn't stripped
  // by the tree shaker if we later drive the layout from it too.
  void VERBS;

  return (
    // The app shell is pinned to exactly one viewport (`h-screen`)
    // with no `flex-1` — flex-1 sets `flex-basis: 0` in a flex parent
    // and lets the flex algorithm override the fixed height, letting
    // the container grow with content and the WINDOW scroll (which
    // then drags the sidebar off-screen on nav). `overflow-hidden`
    // makes the shell a hard cap so `<main>` inside ScrollShell is
    // the only surface that actually scrolls.
    <div className="flex h-screen overflow-hidden">
      <AppSidebar workspace={workspace} reachable={reachable} visibleModules={visibleModules} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          user={session.user}
          unreadNotifications={unreadCount}
          workspace={workspace}
          reachable={reachable}
          visibleModules={visibleModules}
        />
        {/*
          Workspace canvas — deliberately no ambient pattern. Notion /
          Attio / Stripe / Linear all use a plain warm canvas + strong
          card contrast to feel premium; anything else fights the
          typography. The canvas colour comes from the deepened
          --background token in globals.css, and the subtle top-only
          vignette lives inside ScrollShell.
        */}
        <ScrollShell>{children}</ScrollShell>
      </div>
    </div>
  );
}
